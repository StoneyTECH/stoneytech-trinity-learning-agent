# Scenarios

## Standalone

Use this repo by itself for:

- a concept-of-the-day teaching loop
- a recall companion
- a progression-aware curriculum agent

## Pair with StoneyTECH-Trinity-Evidence-Agent

Use the pair when a lesson needs a bounded evidence input first.

```text
StoneyTECH-Trinity-Evidence-Agent -> StoneyTECH-Trinity-Learning-Agent
```

## Pair with StoneyTECH-Trinity-GVAR-Engine

Use the pair when a draft needs explicit review before use or publication.

```text
StoneyTECH-Trinity-Learning-Agent -> StoneyTECH-Trinity-GVAR-Engine
```

## Trinity

Use all three together when the job is:

1. research
2. teach
3. verify

```text
StoneyTECH-Trinity-Evidence-Agent
  -> StoneyTECH-Trinity-Learning-Agent
  -> StoneyTECH-Trinity-GVAR-Engine
```
