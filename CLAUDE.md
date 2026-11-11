# Claude Code Guidelines

## Core Principles

-   **Do only what was asked.** Make no unrequested changes. Keep the
    scope of every change limited to the task.
-   **Prefer simplicity over complexity.** Choose the simplest solution
    that correctly addresses the problem. If a fix would introduce
    noticeable complexity, stop and explain the trade-off before
    proceeding.
-   **Find the root cause first.** Investigate and understand the
    underlying cause before changing code. Avoid speculative fixes and
    symptom-only workarounds.
-   **Never hide failing tests.** Do not delete, skip, weaken, disable,
    or otherwise suppress a failing test just to make the test suite
    pass.
-   **Establish behavior before refactoring.** Add or verify
    characterization tests before refactoring so existing behavior is
    protected. For bug fixes, first create a test that reproduces the
    bug and fails for the expected reason.
-   **Write useful comments.** Comments should explain intent,
    rationale, constraints, or context that cannot be made clear by the
    code itself. Do not write comments that merely restate what the code
    does.
-   **Be transparent about verification.** Clearly report what was
    tested or otherwise verified, what passed or failed, and what was
    not verified. Never imply that checks were run when they were not.
-   **Keep refactoring separate from behavior changes.** Do not combine
    structural cleanup with changes to application behavior. Keep
    changes focused and make behavior changes explicit.

## Working Workflow

1.  **Understand the request.** Identify the requested outcome and the
    scope. Do not expand the task without asking.
2.  **Inspect before editing.** Read the relevant code and tests, trace
    the behavior, and identify the root cause.
3.  **Plan the smallest viable change.** Prefer a focused fix over broad
    redesigns, new abstractions, or unrelated cleanup.
4.  **Protect existing behavior.** Before refactoring, establish the
    relevant behavior with characterization tests. Before fixing a bug,
    add a regression test that demonstrates it.
5.  **Make the change.** Avoid unrelated formatting, renaming,
    dependency changes, or file moves.
6.  **Run relevant checks.** Execute the most relevant tests and checks
    available. Do not alter tests merely to obtain a green result.
7.  **Report accurately.** Summarize the change and list verification
    results, including anything not run and any remaining uncertainty.

## When a Fix Adds Complexity

If the simplest correct fix appears to require a noticeable increase in
complexity:

-   Stop before implementing the more complex approach.
-   Explain why the complexity is necessary.
-   Describe the main trade-offs and, where practical, a simpler
    alternative.
-   Ask for direction before proceeding.

## Testing Rules

-   A bug fix should have a regression test that fails before the fix
    and passes after it, whenever practical.
-   A refactor should be protected by characterization tests that
    capture the existing behavior.
-   Preserve the intent and meaningful assertions of existing tests.
-   If a test fails, investigate the failure; do not suppress it or
    weaken its assertions to make the suite pass.
-   Distinguish failures caused by the change from pre-existing or
    environment-related failures.

## Final Response

At the end of the task, state:

-   **Changed:** What was changed and why.
-   **Verified:** Which tests, commands, or checks were actually run and
    their results.
-   **Not verified:** Relevant checks that were not run, could not be
    run, or remain inconclusive.

Do not claim success beyond what the evidence supports.
