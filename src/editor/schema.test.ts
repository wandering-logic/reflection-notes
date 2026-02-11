import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./schema";

describe("formatTimestamp", () => {
  // Note: Intl.DateTimeFormat output can vary by locale/environment.
  // We test for structural properties rather than exact strings.

  it("returns a non-empty string for valid timestamp", () => {
    const result = formatTimestamp(1707350400000); // Feb 7, 2024
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the year in output", () => {
    const result = formatTimestamp(1707350400000); // Feb 7, 2024
    expect(result).toContain("2024");
  });

  it("formats different years correctly", () => {
    // Use mid-day timestamps to avoid timezone edge cases
    const result2023 = formatTimestamp(1673625600000); // Jan 13, 2023 12:00 UTC
    const result2024 = formatTimestamp(1707825600000); // Feb 13, 2024 12:00 UTC
    expect(result2023).toContain("2023");
    expect(result2024).toContain("2024");
  });

  it("produces different output for different timestamps", () => {
    const result1 = formatTimestamp(1707350400000); // Feb 7, 2024
    const result2 = formatTimestamp(1707436800000); // Feb 8, 2024
    expect(result1).not.toBe(result2);
  });

  it("handles timestamp of 0 (Unix epoch)", () => {
    const result = formatTimestamp(0);
    expect(result).toBeTruthy();
    // Epoch is Jan 1, 1970 UTC, but may show as Dec 31, 1969 in western timezones
    expect(result).toMatch(/19(69|70)/);
  });

  it("handles future timestamps", () => {
    const result = formatTimestamp(2000000000000); // May 2033
    expect(result).toBeTruthy();
    expect(result).toContain("2033");
  });

  it("includes time information (hours/minutes)", () => {
    // 12:00 UTC on Feb 7, 2024
    const result = formatTimestamp(1707307200000);
    // Should contain some numeric time representation
    // The format includes hour and minute with 2-digit option
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("handles negative timestamps (before 1970)", () => {
    // Negative timestamp = before Unix epoch
    const result = formatTimestamp(-86400000); // Dec 31, 1969
    expect(result).toBeTruthy();
    expect(result).toContain("1969");
  });
});
