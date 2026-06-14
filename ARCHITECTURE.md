# Architecture

Two diagrams that cover the interesting engineering: how the **AI coach** answers a
question end-to-end, and the **cache-optimized prompting** that makes those calls cost
almost nothing.

---

## 1. AI Coach — request lifecycle

The browser never talks to DeepSeek directly. Every message goes through a Firebase
Cloud Function that verifies who you are, loads your data, builds the prompt, streams the
answer back, and quietly learns durable facts about you for next time. In demo mode the
sample sets ride along with the request and nothing is read from or written to your real
data.

```mermaid
sequenceDiagram
    autonumber
    actor U as You
    participant C as Browser
    participant F as Coach Function
    participant A as Firebase Auth
    participant DB as Firestore
    participant DS as DeepSeek V4

    U->>C: Ask a question
    C->>C: Collect conversation<br/>demo mode also attaches the sample sets
    C->>F: POST messages (+ entries if demo)<br/>with a Firebase ID token
    F->>A: Verify ID token
    A-->>F: uid

    alt Demo mode
        F->>F: Use client-sent sample sets<br/>no memory, no database
    else Real mode
        F->>DB: Load logged sets + memory profile
        DB-->>F: sets + durable facts
    end

    F->>F: Build cache-optimized prompt<br/>stable prefix, then conversation, then question
    F->>DS: Stream completion request
    DS-->>F: token stream
    F-->>C: relay tokens as they arrive
    C-->>U: Live answer, rendered as markdown

    opt Real mode, after the reply
        F->>DS: Extract durable facts from the exchange
        DS-->>F: facts as JSON
        F->>DB: Save new memories for next time
    end
```

**Why it's built this way**

- **The key stays server-side.** The DeepSeek API key lives in Firebase Secret Manager and
  never reaches the browser; the function is the only thing that holds it.
- **Memory is separate from chat.** Durable facts (sleep, nutrition, training days, injuries,
  goals) are stored apart from any conversation and re-injected into *every* new chat, so the
  coach feels like it remembers you across sessions.
- **Demo is fully isolated.** Sample-mode requests carry their own data and skip the memory
  step entirely — they can never read or pollute your real profile.

---

## 2. Cache-optimized prompting — the "secret weapon"

DeepSeek caches by matching the **longest unchanged token prefix** of a request, and serves
those cached tokens at roughly **1/50th** the price of fresh ones. The trick is simply to put
the big, stable content **first** and the volatile content **last** — so the cache prefix
covers almost the entire prompt on every call.

```mermaid
flowchart TB
    subgraph OPT["Prompt assembled big-and-stable FIRST, volatile LAST"]
        direction TB
        P1["1 — System persona · frozen constant"]
        P2["2 — Training context · deterministic summary of your sets + memory"]
        P3["3 — Conversation so far · earlier turns never change"]
        P4["4 — New question · the only brand-new bytes"]
        P1 --> P2 --> P3 --> P4
    end

    P4 --> ENGINE{{"DeepSeek matches the longest unchanged token prefix"}}
    ENGINE -->|"prefix 1-2-3 identical to last call"| HIT["CACHE HIT<br/>$0.0028 / 1M tokens"]
    ENGINE -->|"only the new tail (4)"| MISS["CACHE MISS<br/>$0.14 / 1M tokens"]
    HIT --> WIN["~50x cheaper on the cached prefix<br/>up to ~90% lower cost per call<br/>vs an unordered prompt"]
    MISS --> WIN

    class P1,P2,P3,HIT cached
    class P4,MISS fresh
    class WIN win
    classDef cached fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef fresh fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;
    classDef win fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
```

**The cost math**

A coach call is mostly stable prefix (persona + training summary + earlier turns) with a tiny
new question at the end. If ~95% of the input matches the cached prefix:

```
unordered prompt:   1.00 × $0.14            = $0.140 / 1M
cache-optimized:    0.95 × $0.0028
                  + 0.05 × $0.14            ≈ $0.010 / 1M
                                            ≈ 93% cheaper
```

Put the volatile bytes first instead, and the prefix changes on every call — nothing caches,
and you pay full price every time. Ordering is the whole game.

> Prices: DeepSeek V4 `deepseek-chat`, fresh input **$0.14 / 1M** vs cached input
> **$0.0028 / 1M**. For comparison, most providers discount cached tokens ~10×; DeepSeek
> does ~50×.
