import { describe, expect, it } from "vitest";
import { reconcileStreamOrder } from "./intent-stream";

describe("reconcileStreamOrder", () => {
  it("adopts the incoming order on a first reconcile (empty prior)", () => {
    const { order, appended } = reconcileStreamOrder([], ["a", "b", "c"]);
    expect(order).toEqual(["a", "b", "c"]);
    expect(appended).toEqual(["a", "b", "c"]);
  });

  it("keeps survivors in their prior slot and appends newcomers at the end", () => {
    // Server re-ranks to [c, a, b, d] but a/b/c already shown — they must NOT move;
    // only the genuinely new "d" is appended (and flagged for the enter animation).
    const { order, appended } = reconcileStreamOrder(["a", "b", "c"], ["c", "a", "b", "d"]);
    expect(order).toEqual(["a", "b", "c", "d"]);
    expect(appended).toEqual(["d"]);
  });

  it("reports nothing appended when the set is unchanged", () => {
    const { order, appended } = reconcileStreamOrder(["a", "b"], ["b", "a"]);
    expect(order).toEqual(["a", "b"]);
    expect(appended).toEqual([]);
  });

  it("drops contents that have gone away", () => {
    const { order, appended } = reconcileStreamOrder(["a", "b", "c"], ["a", "c"]);
    expect(order).toEqual(["a", "c"]);
    expect(appended).toEqual([]);
  });

  it("re-appends a content that left and came back (treated as new)", () => {
    const afterLeaving = reconcileStreamOrder(["a", "b"], ["a"]);
    expect(afterLeaving.order).toEqual(["a"]);
    const afterReturn = reconcileStreamOrder(afterLeaving.order, ["a", "b"]);
    expect(afterReturn.order).toEqual(["a", "b"]);
    expect(afterReturn.appended).toEqual(["b"]);
  });

  it("preserves incoming order among multiple newcomers", () => {
    const { order, appended } = reconcileStreamOrder(["a"], ["a", "x", "y", "z"]);
    expect(order).toEqual(["a", "x", "y", "z"]);
    expect(appended).toEqual(["x", "y", "z"]);
  });
});
