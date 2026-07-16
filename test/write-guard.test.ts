import { describe, expect, test } from "vitest";
import {
  findUnexpectedChanges,
  formatOutOfWikiWarning,
} from "../src/agent/engines/write-guard.ts";

describe("findUnexpectedChanges", () => {
  test("flags changed paths outside openwiki/ but allows openwiki/ writes", () => {
    const porcelain = [" M src/app.ts", "A  openwiki/quickstart.md", ""].join(
      "\n",
    );

    expect(findUnexpectedChanges("", porcelain)).toEqual(["src/app.ts"]);
  });

  test("does not blame pre-existing dirty files on the run", () => {
    const baseline = " M src/app.ts\n";
    const porcelain = " M src/app.ts\n M src/other.ts\n";

    expect(findUnexpectedChanges(baseline, porcelain)).toEqual([
      "src/other.ts",
    ]);
  });

  test("checks both sides of a rename (moving a source file into openwiki/)", () => {
    const porcelain = "R  src/legacy.md -> openwiki/legacy.md\n";

    // The source path left openwiki/, so it is flagged; the destination is fine.
    expect(findUnexpectedChanges("", porcelain)).toEqual(["src/legacy.md"]);
  });

  test("decodes C-quoted paths", () => {
    const porcelain = '?? "src/with space.ts"\n';

    expect(findUnexpectedChanges("", porcelain)).toEqual(["src/with space.ts"]);
  });

  test("returns nothing when every change is under openwiki/", () => {
    const porcelain = "A  openwiki/quickstart.md\n M openwiki/topics/x.md\n";

    expect(findUnexpectedChanges("", porcelain)).toEqual([]);
  });

  test("collapses duplicate out-of-wiki paths", () => {
    const porcelain = " M src/app.ts\n M src/app.ts\n";

    expect(findUnexpectedChanges("", porcelain)).toEqual(["src/app.ts"]);
  });
});

describe("formatOutOfWikiWarning", () => {
  test("returns null when there is nothing unexpected", () => {
    expect(formatOutOfWikiWarning([])).toBeNull();
  });

  test("lists the offending paths under a clear warning", () => {
    const warning = formatOutOfWikiWarning(["src/app.ts", "leak.txt"]);

    expect(warning).toContain("outside the openwiki/ wiki directory");
    expect(warning).toContain("- src/app.ts");
    expect(warning).toContain("- leak.txt");
  });

  test("caps the list and reports overflow", () => {
    const many = Array.from({ length: 13 }, (_, i) => `src/file-${i}.ts`);
    const warning = formatOutOfWikiWarning(many);

    expect(warning).toContain("...and 3 more");
  });
});
