import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { activeSlotIndex, navFor } from '../src/lib/nav-model.ts'
import { pagesFor } from '../src/lib/pages.ts'
import { parsePreference, resolveViewMode } from '../src/lib/view-mode-core.ts'

const ROLES = ['admin', 'leader', 'employee', 'storekeeper']
const tabKeys = (tabs) => tabs.filter((slot) => slot.kind === 'tab').map((slot) => slot.item.key)
const centerPages = (tabs) => tabs.filter((slot) => slot.kind === 'center').map((slot) => slot.page)

describe('navFor', () => {
  test('every nav item, tab and centre page is allowed for its role', () => {
    for (const role of ROLES) {
      const allowed = new Set(pagesFor(role))
      const { all, tabs, groups } = navFor(role)
      for (const item of all) assert.ok(allowed.has(item.key), `${role}: ${item.key} in all`)
      for (const key of tabKeys(tabs)) assert.ok(allowed.has(key), `${role}: tab ${key}`)
      for (const page of centerPages(tabs)) assert.ok(allowed.has(page), `${role}: centre ${page}`)
      for (const item of groups.flatMap((group) => group.items)) assert.ok(allowed.has(item.key), `${role}: group ${item.key}`)
      assert.deepEqual(new Set(all.map((item) => item.key)), allowed, `${role}: all lists exactly the pages the role may open`)
    }
  })

  test('slot counts are admin 5, leader 4, employee 3, storekeeper 5', () => {
    assert.deepEqual(ROLES.map((role) => navFor(role).tabs.length), [5, 4, 3, 5])
  })

  test('the centre slot sits at floor(n/2) and more is last', () => {
    for (const role of ROLES) {
      const { tabs } = navFor(role)
      assert.equal(tabs.filter((slot) => slot.kind === 'center').length, 1, `${role}: one centre`)
      assert.equal(tabs.findIndex((slot) => slot.kind === 'center'), Math.floor(tabs.length / 2), `${role}: centre index`)
      assert.equal(tabs.at(-1).kind, 'more', `${role}: more last`)
      assert.equal(tabs.filter((slot) => slot.kind === 'more').length, 1)
    }
  })

  test('groups never repeat a tab or centre page and together with them cover every item', () => {
    for (const role of ROLES) {
      const { all, tabs, groups } = navFor(role)
      const inBar = new Set([...tabKeys(tabs), ...centerPages(tabs)])
      const grouped = groups.flatMap((group) => group.items.map((item) => item.key))
      assert.equal(new Set(grouped).size, grouped.length, `${role}: no duplicates in groups`)
      for (const key of grouped) assert.ok(!inBar.has(key), `${role}: ${key} is already on the bar`)
      assert.deepEqual(new Set([...inBar, ...grouped]), new Set(all.map((item) => item.key)), `${role}: bar + groups = all`)
      assert.ok(groups.every((group) => group.items.length > 0), `${role}: no empty groups`)
    }
  })

  test('storekeeper centre action opens the receive dialog on the stock page', () => {
    const centre = navFor('storekeeper').tabs.find((slot) => slot.kind === 'center')
    assert.deepEqual([centre.page, centre.query], ['inventory-stock', '?action=receive'])
    assert.equal(navFor('admin').tabs.find((slot) => slot.kind === 'center').page, 'new')
  })

  test('sidebar order and labels keep today\'s wording', () => {
    assert.deepEqual(navFor('admin').all.slice(0, 3).map((item) => item.label), ['ภาพรวม', 'รายการตรวจ', 'บันทึกการตรวจ'])
    assert.deepEqual(navFor('leader').all.map((item) => item.label), ['ภาพรวมทีม', 'ติดตามงานทีม', 'บันทึกการตรวจ'])
    assert.deepEqual(navFor('employee').all.map((item) => item.label), ['บันทึกการตรวจ', 'ประวัติของฉัน'])
  })
})

describe('activeSlotIndex', () => {
  test('a tab page maps to its tab, the centre page to the centre, a sheet-only page to more', () => {
    const { tabs } = navFor('admin')
    assert.equal(activeSlotIndex(tabs, 'dashboard'), 0)
    assert.equal(activeSlotIndex(tabs, 'inspections'), 1)
    assert.equal(activeSlotIndex(tabs, 'new'), 2)
    assert.equal(activeSlotIndex(tabs, 'inventory-stock'), 3)
    assert.equal(activeSlotIndex(tabs, 'users'), 4)
    assert.equal(activeSlotIndex(tabs, 'audit-log'), 4)
  })

  test('storekeeper stock page prefers the stock tab over the centre action', () => {
    assert.equal(activeSlotIndex(navFor('storekeeper').tabs, 'inventory-stock'), 0)
  })
})

describe('view mode', () => {
  test('auto follows the width, mobile and desktop override it', () => {
    assert.equal(resolveViewMode('auto', true), 'mobile')
    assert.equal(resolveViewMode('auto', false), 'desktop')
    assert.equal(resolveViewMode('mobile', false), 'mobile')
    assert.equal(resolveViewMode('desktop', true), 'desktop')
  })

  test('parsePreference falls back to auto for junk', () => {
    for (const raw of [null, '', 'tablet', '"mobile"', 'MOBILE', undefined]) assert.equal(parsePreference(raw), 'auto')
    for (const value of ['auto', 'mobile', 'desktop']) assert.equal(parsePreference(value), value)
  })
})
