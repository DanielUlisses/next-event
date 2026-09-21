"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const {
  CalendarEvent,
  dueReminders,
  reminderKey,
  reminderSummary,
  reminderBody,
  pruneNotified,
  parseNotified,
  filterExcluded
} = require("../Model.js")

const MIN = 60000
const start = new Date(2026, 7, 28, 10, 0, 0)
const end = new Date(2026, 7, 28, 11, 0, 0)

function ev(overrides) {
  return new CalendarEvent(
    Object.assign(
      { uid: "e1", title: "Sprint Review", start: start, end: end, allDay: false },
      overrides
    )
  )
}
const at = minutesBeforeStart => new Date(start.getTime() - minutesBeforeStart * MIN)

describe("reminderKey()", () => {
  it("uses uid and start ms", () => {
    assert.strictEqual(reminderKey(ev()), "e1@" + start.getTime())
  })
  it("falls back to the title without a uid", () => {
    assert.strictEqual(reminderKey(ev({ uid: null })), "Sprint Review@" + start.getTime())
  })
  it("changes when the event is rescheduled", () => {
    const moved = ev({ start: new Date(start.getTime() + 30 * MIN) })
    assert.notStrictEqual(reminderKey(moved), reminderKey(ev()))
  })
})

describe("dueReminders()", () => {
  const due = (now, minutes, notified, options) =>
    dueReminders([ev()], now, minutes, notified || {}, options)

  it("is not due just before the window", () => {
    assert.equal(due(new Date(at(10).getTime() - 1), 10).length, 0)
  })
  it("is due exactly when the window opens", () => {
    assert.equal(due(at(10), 10).length, 1)
  })
  it("is due inside the window (late first sight)", () => {
    assert.equal(due(at(3), 10).length, 1)
  })
  it("is due one ms before the start", () => {
    assert.equal(due(new Date(start.getTime() - 1), 10).length, 1)
  })
  it("is not due at the start", () => {
    assert.equal(due(start, 10).length, 0)
  })
  it("is not due after the start", () => {
    assert.equal(due(new Date(start.getTime() + 5 * MIN), 10).length, 0)
  })
  it("0 disables reminders", () => {
    assert.equal(due(at(3), 0).length, 0)
  })
  it("invalid minutes disable reminders", () => {
    assert.equal(due(at(3), "abc").length, 0)
    assert.equal(due(at(3), -5).length, 0)
  })
  it("skips all-day events", () => {
    const allDay = ev({
      allDay: true,
      start: at(3),
      end: new Date(at(3).getTime() + 24 * 60 * MIN)
    })
    assert.equal(dueReminders([allDay], at(3), 10, {}).length, 0)
  })
  it("skips already-notified keys", () => {
    const notified = { [reminderKey(ev())]: true }
    assert.equal(due(at(3), 10, notified).length, 0)
  })
  it("re-notifies a rescheduled event", () => {
    const notified = { [reminderKey(ev())]: true }
    const moved = ev({
      start: new Date(start.getTime() + 60 * MIN),
      end: new Date(end.getTime() + 60 * MIN)
    })
    assert.equal(
      dueReminders([moved], new Date(moved.start.getTime() - 5 * MIN), 10, notified).length,
      1
    )
  })
  it("honours showOnlyWithVideoLink", () => {
    assert.equal(due(at(3), 10, {}, { showOnlyWithVideoLink: true }).length, 0)
    const withLink = ev({ meetUrl: "https://meet.google.com/abc" })
    assert.equal(dueReminders([withLink], at(3), 10, {}, { showOnlyWithVideoLink: true }).length, 1)
  })
  it("returns each due occurrence once and ignores malformed events", () => {
    const other = ev({ uid: "e2", title: "Other" })
    const list = dueReminders([ev(), other, { title: "no start" }, null], at(3), 10, {})
    assert.deepEqual(
      list.map(e => e.uid),
      ["e1", "e2"]
    )
  })
})

describe("pruneNotified()", () => {
  it("drops entries whose start is in the past and keeps future ones", () => {
    const now = start
    const map = {
      ["a@" + (now.getTime() - 1)]: true,
      ["b@" + now.getTime()]: true,
      ["c@" + (now.getTime() + MIN)]: true
    }
    assert.deepEqual(Object.keys(pruneNotified(map, now)).sort(), [
      "b@" + now.getTime(),
      "c@" + (now.getTime() + MIN)
    ])
  })
  it("drops entries with unparsable keys", () => {
    assert.deepEqual(pruneNotified({ garbage: true }, start), {})
  })
  it("does not mutate its input", () => {
    const map = { ["a@1"]: true }
    pruneNotified(map, start)
    assert.deepEqual(map, { "a@1": true })
  })
})

describe("parseNotified()", () => {
  it("parses a JSON object", () => {
    assert.deepEqual(parseNotified('{"a@1":true}'), { "a@1": true })
  })
  it("returns empty state for missing, corrupt or non-object content", () => {
    assert.deepEqual(parseNotified(""), {})
    assert.deepEqual(parseNotified(null), {})
    assert.deepEqual(parseNotified("{nope"), {})
    assert.deepEqual(parseNotified("[1,2]"), {})
    assert.deepEqual(parseNotified("42"), {})
  })
})

describe("reminderSummary()", () => {
  it("shows minutes rounded up", () => {
    assert.equal(reminderSummary(ev(), at(10)), "Sprint Review · in 10 min")
    assert.equal(reminderSummary(ev(), new Date(at(10).getTime() + 1)), "Sprint Review · in 10 min")
    assert.equal(
      reminderSummary(ev(), new Date(at(10).getTime() + 30000)),
      "Sprint Review · in 10 min"
    )
    assert.equal(reminderSummary(ev(), at(1)), "Sprint Review · in 1 min")
  })
  it("says now under a minute", () => {
    assert.equal(reminderSummary(ev(), new Date(start.getTime() - 59999)), "Sprint Review · now")
  })
  it("falls back to the untitled label", () => {
    assert.equal(reminderSummary(ev({ title: "" }), at(5)), "(Untitled) · in 5 min")
  })
})

describe("reminderBody()", () => {
  const e = ev({ feedLabel: "Work" })
  it("24h with calendar and launcher", () => {
    assert.equal(
      reminderBody(e, { use12Hour: false, showCalendarLabel: true, launcherName: "work" }),
      "10:00–11:00 · Work · via work"
    )
  })
  it("12h", () => {
    assert.equal(
      reminderBody(e, { use12Hour: true, showCalendarLabel: true, launcherName: "" }),
      "10:00 AM–11:00 AM · Work"
    )
  })
  it("omits calendar when the label setting is off or there is none", () => {
    assert.equal(reminderBody(e, { showCalendarLabel: false }), "10:00–11:00")
    assert.equal(reminderBody(ev(), { showCalendarLabel: true }), "10:00–11:00")
  })
  it("omits via when no launcher is named", () => {
    assert.equal(
      reminderBody(e, { showCalendarLabel: true, launcherName: "" }),
      "10:00–11:00 · Work"
    )
  })
  it("defaults to showing the calendar label", () => {
    assert.equal(reminderBody(e), "10:00–11:00 · Work")
  })
})

describe("reminders with excludeKeywords", () => {
  it("skips meetings hidden by excludeKeywords", () => {
    const events = [
      ev({ uid: "a", title: "Lunch break" }),
      ev({ uid: "b", title: "Sprint Review" })
    ]
    const due = dueReminders(filterExcluded(events, "lunch"), at(5), 10, {})
    assert.deepEqual(
      due.map(e => e.uid),
      ["b"]
    )
  })

  it("keeps every meeting when excludeKeywords is empty", () => {
    const events = [ev({ uid: "a", title: "Lunch break" }), ev({ uid: "b" })]
    assert.equal(dueReminders(filterExcluded(events, ""), at(5), 10, {}).length, 2)
  })
})
