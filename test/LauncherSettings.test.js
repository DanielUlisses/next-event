"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

describe("launcherRows", () => {
  it("lists launchers in stored order as name/command rows", () => {
    assert.deepEqual(Model.launcherRows('{"work":"chrome --p 2","teams":"teams-for-linux"}'), [
      { name: "work", command: "chrome --p 2" },
      { name: "teams", command: "teams-for-linux" }
    ])
  })

  it("returns no rows for empty or invalid input and skips non-string commands", () => {
    assert.deepEqual(Model.launcherRows(""), [])
    assert.deepEqual(Model.launcherRows("{nope"), [])
    assert.deepEqual(Model.launcherRows('{"a":1,"b":"cmd"}'), [{ name: "b", command: "cmd" }])
  })
})

describe("serializeLaunchers", () => {
  it("writes trimmed names and commands as a JSON object", () => {
    const json = Model.serializeLaunchers("", [{ name: " work ", command: " chrome " }])
    assert.deepEqual(JSON.parse(json), { work: "chrome" })
  })

  it("drops blank names and duplicate names (first wins)", () => {
    const json = Model.serializeLaunchers("", [
      { name: "", command: "x" },
      { name: "   ", command: "y" },
      { name: "a", command: "first" },
      { name: "a", command: "second" }
    ])
    assert.deepEqual(JSON.parse(json), { a: "first" })
  })

  it("keeps entries the UI does not show (non-string values) from the existing value", () => {
    const json = Model.serializeLaunchers('{"a":"old","weird":{"k":1}}', [
      { name: "a", command: "new" }
    ])
    assert.deepEqual(JSON.parse(json), { a: "new", weird: { k: 1 } })
  })

  it("removes launchers whose rows were removed", () => {
    const json = Model.serializeLaunchers('{"a":"1","b":"2"}', [{ name: "b", command: "2" }])
    assert.deepEqual(JSON.parse(json), { b: "2" })
  })

  it("serializes no rows to an empty string so the setting reads as unset", () => {
    assert.equal(Model.serializeLaunchers('{"a":"1"}', []), "")
  })
})

describe("calendarLauncherChoice", () => {
  it("returns the mapped launcher for a calendar, matching like the resolver", () => {
    assert.equal(Model.calendarLauncherChoice('{"work":"w"}', " Work "), "w")
  })

  it("returns empty string when unmapped or invalid", () => {
    assert.equal(Model.calendarLauncherChoice('{"Work":"w"}', "Other"), "")
    assert.equal(Model.calendarLauncherChoice("nope", "Work"), "")
  })
})

describe("serializeCalendarLauncher", () => {
  it("adds a mapping", () => {
    const json = Model.serializeCalendarLauncher("", "Work", "work")
    assert.deepEqual(JSON.parse(json), { Work: "work" })
  })

  it("updates the existing key in place, keeping its spelling", () => {
    const json = Model.serializeCalendarLauncher('{"work":"a","Other":"b"}', "Work", "c")
    assert.deepEqual(JSON.parse(json), { work: "c", Other: "b" })
  })

  it("an empty launcher (Default) removes the mapping, including case variants", () => {
    const json = Model.serializeCalendarLauncher('{"work":"a","WORK":"b","Other":"c"}', "Work", "")
    assert.deepEqual(JSON.parse(json), { Other: "c" })
  })

  it("preserves unknown entries", () => {
    const json = Model.serializeCalendarLauncher('{"x":42}', "Work", "w")
    assert.deepEqual(JSON.parse(json), { x: 42, Work: "w" })
  })

  it("returns an empty string when the last mapping is removed", () => {
    assert.equal(Model.serializeCalendarLauncher('{"Work":"a"}', "Work", ""), "")
  })

  it("ignores blank calendar names by leaving the value untouched", () => {
    assert.equal(Model.serializeCalendarLauncher('{"a":"b"}', "  ", "w"), '{"a":"b"}')
  })
})

describe("calendarLauncherOptions", () => {
  it("offers Default plus launcher names", () => {
    assert.deepEqual(Model.calendarLauncherOptions(["work", "teams"], ""), ["", "work", "teams"])
  })

  it("appends a current value that names no known launcher so it stays visible", () => {
    assert.deepEqual(Model.calendarLauncherOptions(["work"], "gone"), ["", "work", "gone"])
  })
})

describe("calendarLauncherChoice with provider objects", () => {
  it("reads the default of an object value", () => {
    assert.equal(Model.calendarLauncherChoice('{"Work":{"default":"w","teams":"t"}}', "work"), "w")
  })

  it("is empty when the object has no default", () => {
    assert.equal(Model.calendarLauncherChoice('{"Work":{"teams":"t"}}', "Work"), "")
  })
})

describe("calendarTeamsChoice / serializeCalendarTeams", () => {
  it("reads the teams launcher, case-insensitively, or empty", () => {
    assert.equal(Model.calendarTeamsChoice('{"Work":{"default":"w","Teams":"t"}}', "work"), "t")
    assert.equal(Model.calendarTeamsChoice('{"Work":"w"}', "Work"), "")
    assert.equal(Model.calendarTeamsChoice('{"Work":{"default":"w"}}', "Work"), "")
    assert.equal(Model.calendarTeamsChoice("nope", "Work"), "")
  })

  it("converts a string value to the object form when a teams launcher is chosen", () => {
    const json = Model.serializeCalendarTeams('{"Work":"w","Other":"o"}', "Work", "t")
    assert.deepEqual(JSON.parse(json), { Work: { default: "w", teams: "t" }, Other: "o" })
  })

  it("creates an object without default for an unmapped calendar", () => {
    const json = Model.serializeCalendarTeams("", "Work", "t")
    assert.deepEqual(JSON.parse(json), { Work: { teams: "t" } })
  })

  it("updates an existing teams key in place and keeps other provider keys", () => {
    const json = Model.serializeCalendarTeams(
      '{"Work":{"default":"w","Teams":"old","zoom":"z"}}',
      "Work",
      "new"
    )
    assert.deepEqual(JSON.parse(json), { Work: { default: "w", Teams: "new", zoom: "z" } })
  })

  it("collapses back to a plain string when cleared and only default remains", () => {
    const json = Model.serializeCalendarTeams('{"Work":{"default":"w","teams":"t"}}', "Work", "")
    assert.deepEqual(JSON.parse(json), { Work: "w" })
  })

  it("keeps the object when clearing teams leaves other provider keys", () => {
    const json = Model.serializeCalendarTeams(
      '{"Work":{"default":"w","teams":"t","zoom":"z"}}',
      "Work",
      ""
    )
    assert.deepEqual(JSON.parse(json), { Work: { default: "w", zoom: "z" } })
  })

  it("removes the mapping when clearing leaves nothing, and is a no-op for strings", () => {
    assert.equal(Model.serializeCalendarTeams('{"Work":{"teams":"t"}}', "Work", ""), "")
    assert.equal(Model.serializeCalendarTeams('{"Work":"w"}', "Work", ""), '{"Work":"w"}')
  })

  it("round-trips string -> object -> string", () => {
    const start = '{"Work":"w"}'
    const withTeams = Model.serializeCalendarTeams(start, "Work", "t")
    assert.equal(Model.serializeCalendarTeams(withTeams, "Work", ""), start)
  })

  it("ignores blank calendar names", () => {
    assert.equal(Model.serializeCalendarTeams('{"a":"b"}', " ", "t"), '{"a":"b"}')
  })
})

describe("serializeCalendarLauncher with provider objects", () => {
  it("changes only default, keeping the teams key", () => {
    const json = Model.serializeCalendarLauncher(
      '{"Work":{"default":"w","teams":"t"}}',
      "Work",
      "x"
    )
    assert.deepEqual(JSON.parse(json), { Work: { default: "x", teams: "t" } })
  })

  it("clearing default keeps other provider keys, and drops an emptied object", () => {
    assert.deepEqual(
      JSON.parse(
        Model.serializeCalendarLauncher('{"Work":{"default":"w","teams":"t"}}', "Work", "")
      ),
      { Work: { teams: "t" } }
    )
    assert.equal(Model.serializeCalendarLauncher('{"Work":{"default":"w"}}', "Work", ""), "")
  })

  it("adds a default to an object that lacks one", () => {
    const json = Model.serializeCalendarLauncher('{"Work":{"teams":"t"}}', "Work", "w")
    assert.deepEqual(JSON.parse(json), { Work: { teams: "t", default: "w" } })
  })
})
