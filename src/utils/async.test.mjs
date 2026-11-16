import test from "node:test";
import assert from "node:assert/strict";
import { createDebouncer, createLatestRequestTracker } from "./async.ts";

test("createLatestRequestTracker marks older requests stale when a newer one starts (#7)", () => {
  const tracker = createLatestRequestTracker();
  const first = tracker.next();
  assert.equal(first.isStale(), false);

  const second = tracker.next();
  assert.equal(first.isStale(), true);
  assert.equal(second.isStale(), false);

  tracker.invalidate();
  assert.equal(second.isStale(), true);
});

test("createDebouncer only invokes the latest scheduled callback after delay (#7)", async () => {
  const debouncer = createDebouncer(30);
  const calls = [];

  debouncer.schedule(() => calls.push("a"));
  debouncer.schedule(() => calls.push("ab"));
  debouncer.schedule(() => calls.push("abc"));

  assert.deepEqual(calls, []);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["abc"]);
});

test("createDebouncer cancel prevents pending callback from firing (#7)", async () => {
  const debouncer = createDebouncer(30);
  let called = false;

  debouncer.schedule(() => {
    called = true;
  });
  debouncer.cancel();

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(called, false);
});
