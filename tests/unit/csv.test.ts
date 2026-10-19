import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/server/csv";

describe("csvCell: spreadsheet formula injection", () => {
  it.each(["=1+1", "+SUM(A1)", "-2+3", "@HYPERLINK(\"http://evil\")", "\tcmd", "\r=1", "=cmd|' /C calc'!A0"])("neutralises %j", (v) => {
    const out = csvCell(v);
    expect(out.replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("leaves ordinary values alone and quotes when needed", () => {
    expect(csvCell("AXM-00000001")).toBe("AXM-00000001");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("serialises dates and objects", () => {
    expect(csvCell(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-19T10:00:00.000Z");
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it("a value that is dangerous AFTER quoting rules still gets the prefix inside the quotes", () => {
    expect(csvCell("=1,2")).toBe("\"'=1,2\"");
  });
});

describe("toCsv", () => {
  it("writes a BOM, CRLF lines and escapes header cells too", () => {
    const out = toCsv(["id", "=bad"], [[1, "x"], [2, "=y"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.split("\r\n")).toEqual(["﻿id,'=bad", "1,x", "2,'=y", ""]);
  });
});
