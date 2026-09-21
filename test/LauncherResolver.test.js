"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

const CHROME2 = 'google-chrome-stable --profile-directory="Profile 2"'
const CHROME3 = 'google-chrome-stable --profile-directory="Profile 3"'

const LAUNCHERS = JSON.stringify({ work: CHROME2, personal: CHROME3, teams: "teams-for-linux" })
const CALENDARS = JSON.stringify({ Work: "work", Personal: "personal" })
const RULES = JSON.stringify([{ match: "Daily Sync", calendar: "Work", launcher: "teams" }])

function config(overrides) {
  return Object.assign(
    {
      launchers: LAUNCHERS,
      calendarLaunchers: CALENDARS,
      launcherRules: RULES,
      browserCommand: ""
    },
    overrides
  )
}

const ics = (title, feedLabel) => ({ title, feedLabel, calendarName: "" })
const json = (title, calendarName) => ({ title, feedLabel: null, calendarName })
const withMeet = (event, meetUrl) => Object.assign({}, event, { meetUrl })

const TEAMS_URL = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=x"
const MEET_URL = "https://meet.google.com/abc-defg-hij"

describe("parseLaunchers / parseCalendarLaunchers / parseLauncherRules", () => {
  it("parse JSON strings", () => {
    assert.deepEqual(Model.parseLaunchers('{"a":"cmd"}'), { a: "cmd" })
    assert.deepEqual(Model.parseCalendarLaunchers('{"Work":"a"}'), { Work: "a" })
    assert.deepEqual(Model.parseLauncherRules('[{"match":"x","launcher":"a"}]'), [
      { match: "x", provider: "", calendar: "", launcher: "a" }
    ])
  })

  it("return empty values for empty, invalid or wrongly-shaped input", () => {
    for (const bad of ["", null, undefined, "{nope", "[]", "42", '"s"']) {
      assert.deepEqual(Model.parseLaunchers(bad), {})
      assert.deepEqual(Model.parseCalendarLaunchers(bad), {})
    }
    for (const bad of ["", null, undefined, "[nope", "{}", "42"]) {
      assert.deepEqual(Model.parseLauncherRules(bad), [])
    }
  })

  it("accept already-parsed values", () => {
    assert.deepEqual(Model.parseLaunchers({ a: "cmd" }), { a: "cmd" })
    assert.equal(Model.parseLauncherRules([{ match: "x", launcher: "a" }]).length, 1)
  })

  it("drop malformed entries but keep valid ones", () => {
    assert.deepEqual(Model.parseLaunchers('{"a":"cmd","b":5,"c":null}'), { a: "cmd" })
    const rules = Model.parseLauncherRules(
      '[{"match":"","launcher":"a"},{"match":"x"},7,{"match":"ok","launcher":"a"}]'
    )
    assert.deepEqual(rules, [{ match: "ok", provider: "", calendar: "", launcher: "a" }])
  })
})

describe("resolveLauncher", () => {
  it("empty config reproduces current behaviour", () => {
    const e = ics("Daily Sync", "Work")
    assert.deepEqual(Model.resolveLauncher(e, "join", {}), {
      command: "xdg-open",
      launcherName: "",
      source: "default",
      warnings: []
    })
    const withBrowser = Model.resolveLauncher(e, "join", { browserCommand: " firefox " })
    assert.equal(withBrowser.command, "firefox")
    assert.equal(withBrowser.source, "browserCommand")
    assert.equal(withBrowser.launcherName, "")
    assert.equal(Model.resolveLauncher(e, "join").command, "xdg-open")
  })

  it("rule beats calendar", () => {
    const r = Model.resolveLauncher(ics("Daily Sync", "Work"), "join", config())
    assert.equal(r.command, "teams-for-linux")
    assert.equal(r.launcherName, "teams")
    assert.equal(r.source, "rule")
  })

  it("calendar mapping applies when no rule matches", () => {
    const r = Model.resolveLauncher(ics("1:1", "Work"), "join", config())
    assert.equal(r.command, CHROME2)
    assert.equal(r.launcherName, "work")
    assert.equal(r.source, "calendar")
  })

  it("calendar-restricted rule only applies within that calendar", () => {
    const r = Model.resolveLauncher(ics("Daily Sync", "Personal"), "join", config())
    assert.equal(r.source, "calendar")
    assert.equal(r.launcherName, "personal")
  })

  it("rule without calendar applies to every calendar", () => {
    const rules = JSON.stringify([{ match: "sync", launcher: "teams" }])
    const r = Model.resolveLauncher(
      ics("Daily Sync", "Personal"),
      "join",
      config({ launcherRules: rules })
    )
    assert.equal(r.source, "rule")
  })

  it("first matching rule wins", () => {
    const rules = JSON.stringify([
      { match: "Daily", launcher: "personal" },
      { match: "Daily Sync", launcher: "teams" }
    ])
    const r = Model.resolveLauncher(
      ics("Daily Sync", "Work"),
      "join",
      config({ launcherRules: rules })
    )
    assert.equal(r.launcherName, "personal")
  })

  it("matches title substring case-insensitively", () => {
    const r = Model.resolveLauncher(ics("the DAILY SYNC (weekly)", "Work"), "join", config())
    assert.equal(r.source, "rule")
  })

  it("matches calendar names trimmed, case-insensitive and whole-name", () => {
    assert.equal(Model.resolveLauncher(ics("x", "  wORk "), "join", config()).launcherName, "work")
    assert.equal(Model.resolveLauncher(ics("x", "Work Stuff"), "join", config()).source, "default")
    const cals = JSON.stringify({ " work ": "work" })
    assert.equal(
      Model.resolveLauncher(ics("x", "Work"), "join", config({ calendarLaunchers: cals }))
        .launcherName,
      "work"
    )
  })

  it("resolves JSON-mode calendarName and ICS feedLabel", () => {
    assert.equal(
      Model.resolveLauncher(json("x", "Personal"), "join", config()).launcherName,
      "personal"
    )
    assert.equal(
      Model.resolveLauncher(ics("x", "Personal"), "join", config()).launcherName,
      "personal"
    )
    const both = { title: "x", feedLabel: "Work", calendarName: "Personal" }
    assert.equal(Model.resolveLauncher(both, "join", config()).launcherName, "work")
  })

  it("open-in-calendar ignores rules", () => {
    const r = Model.resolveLauncher(ics("Daily Sync", "Work"), "calendar", config())
    assert.equal(r.source, "calendar")
    assert.equal(r.launcherName, "work")
  })

  it("open-in-calendar falls back to browserCommand then xdg-open", () => {
    const e = ics("x", "Unknown")
    assert.equal(
      Model.resolveLauncher(e, "calendar", config({ browserCommand: "firefox" })).source,
      "browserCommand"
    )
    assert.equal(Model.resolveLauncher(e, "calendar", config()).source, "default")
  })

  it("dangling rule launcher warns and falls through to the calendar mapping", () => {
    const rules = JSON.stringify([{ match: "Daily", launcher: "ghost" }])
    const r = Model.resolveLauncher(
      ics("Daily Sync", "Work"),
      "join",
      config({ launcherRules: rules })
    )
    assert.equal(r.source, "calendar")
    assert.equal(r.warnings.length, 1)
    assert.match(r.warnings[0], /ghost/)
  })

  it("dangling calendar launcher warns and falls through to browserCommand", () => {
    const cals = JSON.stringify({ Work: "ghost" })
    const r = Model.resolveLauncher(
      ics("x", "Work"),
      "join",
      config({ calendarLaunchers: cals, browserCommand: "firefox" })
    )
    assert.equal(r.source, "browserCommand")
    assert.match(r.warnings[0], /ghost/)
    assert.match(r.warnings[0], /Work/)
  })

  it("empty launcher command falls through with a warning", () => {
    const launchers = JSON.stringify({ work: "  ", teams: "teams-for-linux" })
    const r = Model.resolveLauncher(ics("x", "Work"), "join", config({ launchers }))
    assert.equal(r.source, "default")
    assert.match(r.warnings[0], /work/)
  })

  it("invalid JSON in one setting is ignored, others still apply", () => {
    const r = Model.resolveLauncher(
      ics("Daily Sync", "Work"),
      "join",
      config({ launcherRules: "{bad" })
    )
    assert.equal(r.source, "calendar")
    const r2 = Model.resolveLauncher(
      ics("Daily Sync", "Work"),
      "join",
      config({ launchers: "{bad" })
    )
    assert.equal(r2.source, "default")
  })

  it("handles a missing event", () => {
    assert.equal(Model.resolveLauncher(null, "join", config()).source, "default")
  })

  describe("provider rules", () => {
    const rulesOf = rules => config({ launcherRules: JSON.stringify(rules) })

    it("provider-only rule matches by provider label, case-insensitively", () => {
      for (const provider of ["teams", "Teams", "TEAMS"]) {
        const r = Model.resolveLauncher(
          withMeet(ics("1:1", "Acme"), TEAMS_URL),
          "join",
          rulesOf([{ provider, launcher: "teams" }])
        )
        assert.equal(r.source, "rule")
        assert.equal(r.launcherName, "teams")
      }
    })

    it("provider + calendar only applies within that calendar", () => {
      const cfg = rulesOf([{ provider: "teams", calendar: "Acme", launcher: "teams" }])
      const inside = Model.resolveLauncher(withMeet(ics("x", "Acme"), TEAMS_URL), "join", cfg)
      assert.equal(inside.source, "rule")
      const outside = Model.resolveLauncher(withMeet(ics("x", "Personal"), TEAMS_URL), "join", cfg)
      assert.equal(outside.source, "calendar")
      assert.equal(outside.launcherName, "personal")
    })

    it("provider + title requires both", () => {
      const cfg = rulesOf([{ provider: "teams", match: "Daily Sync", launcher: "teams" }])
      const both = Model.resolveLauncher(
        withMeet(ics("Daily Sync", "Personal"), TEAMS_URL),
        "join",
        cfg
      )
      assert.equal(both.source, "rule")
      const wrongTitle = Model.resolveLauncher(
        withMeet(ics("1:1", "Personal"), TEAMS_URL),
        "join",
        cfg
      )
      assert.equal(wrongTitle.source, "calendar")
      const wrongProvider = Model.resolveLauncher(
        withMeet(ics("Daily Sync", "Personal"), MEET_URL),
        "join",
        cfg
      )
      assert.equal(wrongProvider.source, "calendar")
    })

    it("non-matching provider falls through to the calendar mapping", () => {
      const r = Model.resolveLauncher(
        withMeet(ics("1:1", "Work"), MEET_URL),
        "join",
        rulesOf([{ provider: "teams", launcher: "teams" }])
      )
      assert.equal(r.source, "calendar")
      assert.equal(r.launcherName, "work")
    })

    it("an event without a meetUrl never matches a provider rule", () => {
      const cfg = rulesOf([{ provider: "video", launcher: "teams" }])
      for (const meetUrl of [undefined, null, ""]) {
        const r = Model.resolveLauncher(withMeet(ics("1:1", "Work"), meetUrl), "join", cfg)
        assert.equal(r.source, "calendar")
      }
      assert.equal(Model.resolveLauncher(ics("1:1", "Work"), "join", cfg).source, "calendar")
    })

    it("a rule with neither match nor provider is ignored with a warning", t => {
      const warn = t.mock.method(console, "warn", () => {})
      const rules = Model.parseLauncherRules('[{"calendar":"Work","launcher":"a"}]')
      assert.deepEqual(rules, [])
      assert.equal(warn.mock.callCount(), 1)
      assert.match(warn.mock.calls[0].arguments[0], /match.*provider/)
    })

    it("resolve reports an invalid rule in warnings instead of logging", t => {
      const warn = t.mock.method(console, "warn", () => {})
      const r = Model.resolveLauncher(
        withMeet(ics("1:1", "Work"), TEAMS_URL),
        "join",
        rulesOf([{ calendar: "Work", launcher: "teams" }])
      )
      assert.equal(r.source, "calendar")
      assert.equal(warn.mock.callCount(), 0)
      assert.equal(r.warnings.length, 1)
      assert.match(r.warnings[0], /match.*provider/)
    })

    it("provider rules do not affect open-in-calendar", () => {
      const r = Model.resolveLauncher(
        withMeet(ics("1:1", "Work"), TEAMS_URL),
        "calendar",
        rulesOf([{ provider: "teams", launcher: "teams" }])
      )
      assert.equal(r.source, "calendar")
    })

    it("dangling provider-rule launcher warns and falls through", () => {
      const r = Model.resolveLauncher(
        withMeet(ics("1:1", "Work"), TEAMS_URL),
        "join",
        rulesOf([{ provider: "teams", launcher: "ghost" }])
      )
      assert.equal(r.source, "calendar")
      assert.match(r.warnings[0], /ghost/)
    })
  })

  describe("multiple Teams accounts", () => {
    const PERSONAL_CMD =
      "teams-for-linux --class=teams-personal --user-data-dir=/home/you/.config/teams-personal"
    const cfg = config({
      launchers: JSON.stringify({ teams: "teams-for-linux", "teams-personal": PERSONAL_CMD }),
      calendarLaunchers: "",
      launcherRules: JSON.stringify([
        { provider: "teams", match: "Book Club", launcher: "teams-personal" },
        { provider: "teams", calendar: "Personal", launcher: "teams-personal" },
        { provider: "teams", launcher: "teams" }
      ])
    })
    const resolve = event => Model.resolveLauncher(withMeet(event, TEAMS_URL), "join", cfg)

    it("routes a Teams meeting in the Personal calendar to the personal instance", () => {
      const r = resolve(ics("Standup", "Personal"))
      assert.equal(r.launcherName, "teams-personal")
      assert.equal(r.command, PERSONAL_CMD)
    })

    it("routes a Teams meeting in any other calendar to the default instance", () => {
      const r = resolve(ics("Standup", "Work"))
      assert.equal(r.launcherName, "teams")
      assert.equal(r.command, "teams-for-linux")
    })

    it("lets a title-matched rule override the calendar within the same calendar", () => {
      assert.equal(resolve(ics("Book Club", "Work")).launcherName, "teams-personal")
    })

    it("sends both recurring calls of one calendar to different instances", () => {
      assert.equal(resolve(ics("Book Club", "Work")).launcherName, "teams-personal")
      assert.equal(resolve(ics("Daily Sync", "Work")).launcherName, "teams")
    })
  })
})

describe("per-calendar provider launchers", () => {
  const PROVIDER_LAUNCHERS = JSON.stringify({
    acme: "chrome-p1",
    personal: "chrome-default",
    "teams-personal": "teams-personal-cmd",
    teams: "teams-for-linux"
  })
  const cfg = (calendarLaunchers, overrides) =>
    config(
      Object.assign(
        { launchers: PROVIDER_LAUNCHERS, launcherRules: "", calendarLaunchers },
        overrides
      )
    )
  const PERSONAL = { Personal: { default: "personal", teams: "teams-personal" } }
  const join = (event, calendars, overrides) =>
    Model.resolveLauncher(event, "join", cfg(JSON.stringify(calendars), overrides))

  it("parseCalendarLaunchers keeps string values and provider objects, dropping junk", () => {
    assert.deepEqual(
      Model.parseCalendarLaunchers(
        '{"A":"a","B":{" Teams ":"t","default":"d","zoom":5},"C":7,"D":[1],"E":null}'
      ),
      { A: "a", B: { teams: "t", default: "d" } }
    )
  })

  it("string values behave as before", () => {
    const r = join(withMeet(ics("x", "Acme"), TEAMS_URL), { Acme: "acme" })
    assert.equal(r.launcherName, "acme")
    assert.equal(r.source, "calendar")
  })

  it("uses the provider launcher when the event's provider matches", () => {
    const r = join(withMeet(ics("x", "Personal"), TEAMS_URL), PERSONAL)
    assert.equal(r.launcherName, "teams-personal")
    assert.equal(r.command, "teams-personal-cmd")
    assert.equal(r.source, "calendar")
  })

  it("provider miss falls to the calendar default", () => {
    const r = join(withMeet(ics("x", "Personal"), MEET_URL), PERSONAL)
    assert.equal(r.launcherName, "personal")
  })

  it("an event without a video link uses the calendar default", () => {
    assert.equal(join(ics("x", "Personal"), PERSONAL).launcherName, "personal")
  })

  it("an object without default skips that level to browserCommand", () => {
    const r = join(
      withMeet(ics("x", "Personal"), MEET_URL),
      { Personal: { teams: "teams-personal" } },
      { browserCommand: "firefox" }
    )
    assert.equal(r.source, "browserCommand")
    assert.deepEqual(r.warnings, [])
  })

  it("provider keys match case-insensitively and unknown keys are ignored", () => {
    const cals = { Personal: { DEFAULT: "personal", Teams: "teams-personal", bogus: "teams" } }
    assert.equal(
      join(withMeet(ics("x", "Personal"), TEAMS_URL), cals).launcherName,
      "teams-personal"
    )
    assert.equal(join(withMeet(ics("x", "Personal"), MEET_URL), cals).launcherName, "personal")
  })

  it("open-in-calendar uses only the default, never a provider launcher", () => {
    const r = Model.resolveLauncher(
      withMeet(ics("x", "Personal"), TEAMS_URL),
      "calendar",
      cfg(JSON.stringify(PERSONAL))
    )
    assert.equal(r.launcherName, "personal")
    const noDefault = Model.resolveLauncher(
      withMeet(ics("x", "Personal"), TEAMS_URL),
      "calendar",
      cfg(JSON.stringify({ Personal: { teams: "teams-personal" } }))
    )
    assert.equal(noDefault.source, "default")
  })

  it("a matching rule still beats the calendar provider launcher", () => {
    const rules = JSON.stringify([{ match: "Sync", launcher: "teams" }])
    const r = join(withMeet(ics("Sync", "Personal"), TEAMS_URL), PERSONAL, {
      launcherRules: rules
    })
    assert.equal(r.source, "rule")
    assert.equal(r.launcherName, "teams")
  })

  it("dangling provider launcher warns and falls through to default", () => {
    const r = join(withMeet(ics("x", "Personal"), TEAMS_URL), {
      Personal: { default: "personal", teams: "ghost" }
    })
    assert.equal(r.launcherName, "personal")
    assert.equal(r.warnings.length, 1)
    assert.match(r.warnings[0], /ghost/)
    assert.match(r.warnings[0], /Personal/)
  })

  it("dangling default falls through to browserCommand with a warning", () => {
    const r = join(
      withMeet(ics("x", "Personal"), MEET_URL),
      { Personal: { default: "ghost" } },
      { browserCommand: "firefox" }
    )
    assert.equal(r.source, "browserCommand")
    assert.match(r.warnings[0], /ghost/)
  })
})
