# Tool-selection evaluation

Regression suite for the tool descriptions in `docs/tool-descriptions.md`. The descriptions are
what Claude reads to choose a tool, so they are tested the same way a skill is: feed an LLM only
the descriptions plus a set of prompts and check it picks the intended tool.

## Protocol

1. Give a fresh agent only the 12 tool descriptions (no code, no other context).
2. Ask it to pick the single best tool — or `none` — for each prompt below.
3. Score picks against **expected**. Target ≥ 90% accuracy.
4. If a description misfires, revise it (in the tool file and `docs/tool-descriptions.md`) and
   re-run.

This is a single-judge check, not a statistical one — re-run when descriptions change.

## Prompts and expected tools

| #   | Prompt                                                         | Expected               |
| --- | -------------------------------------------------------------- | ---------------------- |
| P1  | Register the agent at https://x/.well-known/agent-card.json    | `register_agent`       |
| P2  | Add my A2A bot to VerifyAX                                     | `register_agent`       |
| P3  | Which tags can I use for an interview scenario?                | `list_compatible_tags` |
| P4  | What skill tags work with info_exchange?                       | `list_compatible_tags` |
| P5  | Show me all my registered agents                               | `list_agents`          |
| P6  | List the API-type agents in my workspace                       | `list_agents`          |
| P7  | Delete agent 1234                                              | `delete_agent`         |
| P8  | Remove the agent with uuid abc                                 | `delete_agent`         |
| P9  | Create an interview scenario tagged empathy                    | `generate_scenario`    |
| P10 | Generate a new info_exchange test with the coordination tag    | `generate_scenario`    |
| P11 | List my scenarios that failed                                  | `list_scenarios`       |
| P12 | Show all interview scenarios                                   | `list_scenarios`       |
| P13 | Delete scenario xyz                                            | `delete_scenario`      |
| P14 | Evaluate my agent abc against scenario xyz and show the scores | `evaluate_agent`       |
| P15 | Run agent A on scenario S and tell me how it did               | `evaluate_agent`       |
| P16 | Show my recent simulation runs                                 | `list_recent_runs`     |
| P17 | What runs completed today?                                     | `list_recent_runs`     |
| P18 | Show me the scores for run 999                                 | `get_run_details`      |
| P19 | What was the outcome of simulation 42?                         | `get_run_details`      |
| P20 | How much credit have I used this month?                        | `get_usage_summary`    |
| P21 | Summarize my spend for scenario S                              | `get_usage_summary`    |
| P22 | How much will it cost to run agent A on scenario S?            | `preview_run_cost`     |
| P23 | Estimate credits before I run this eval                        | `preview_run_cost`     |
| P24 | What's the weather today?                                      | `none`                 |
| P25 | Help me write a Python script                                  | `none`                 |

## Last result

- **Date:** 2026-06-25
- **Score:** 25/25 (100%)
- **Misses:** none

The overlapping pairs were all disambiguated correctly: `get_run_details` vs `list_recent_runs`,
`get_usage_summary` (past spend) vs `preview_run_cost` (future estimate), and `list_compatible_tags`
vs `list_scenarios`. No description changes were required.
