import { describe, expect, it } from "vitest";
import { addDays } from "../rules/engine";
import { toISTDate } from "./time";

// admin review judges notice from toISTDate(request.submittedAt), so the timestamp has to
// land on the right Indian day, even while UTC is still on the previous one
describe("toISTDate", () => {
  it("returns the same day for a UTC daytime timestamp", () => {
    expect(toISTDate(new Date("2026-10-12T06:00:00Z"))).toBe("2026-10-12"); // 11:30 IST
  });

  it("rolls to the next day once it is past midnight in India", () => {
    expect(toISTDate(new Date("2026-10-12T18:29:59Z"))).toBe("2026-10-12"); // 23:59:59 IST
    expect(toISTDate(new Date("2026-10-12T18:30:00Z"))).toBe("2026-10-13"); // 00:00 IST
  });

  it("keeps a request submitted with exactly the minimum notice valid on later days", () => {
    // Submitted at 00:30 IST on the 13th for a move on the 16th, with 3 days notice required.
    const submittedAt = new Date("2026-10-12T19:00:00Z");
    const earliestAllowed = addDays(toISTDate(submittedAt), 3);
    expect(earliestAllowed).toBe("2026-10-16");
    // Counting from the UTC date instead would allow the 15th, one day too early.
    expect(addDays(submittedAt.toISOString().slice(0, 10), 3)).toBe("2026-10-15");
  });
});
