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

  test('slot counts are admin 5, leader 5, employee 4, storekeeper 5', () => {
    assert.deepEqual(ROLES.map((role) => navFor(role).tabs.length), [5, 5, 4, 5])
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
    assert.deepEqual(navFor('leader').all.map((item) => item.label), ['ภาพรวมทีม', 'ติดตามงานทีม', 'บันทึกการตรวจ', 'เบิกของ', 'ใบเบิกของฉัน', 'รออนุมัติ', 'รายงานการเบิก'])
    assert.deepEqual(navFor('employee').all.map((item) => item.label), ['บันทึกการตรวจ', 'ประวัติของฉัน', 'เบิกของ', 'ใบเบิกของฉัน'])
  })
})

describe('requisition navigation', () => {
  const keysOf = (role) => navFor(role).all.map((item) => item.key)
  const bar = (role) => navFor(role).tabs.map((slot) => (slot.kind === 'tab' ? slot.item.key : slot.kind === 'center' ? `center:${slot.page}` : 'more'))

  test('each role gets the requisition pages it may use', () => {
    assert.ok(keysOf('employee').includes('requisition-new') && keysOf('employee').includes('requisitions'))
    assert.ok(!keysOf('employee').includes('approvals') && !keysOf('employee').includes('issue-queue'))
    assert.ok(keysOf('leader').includes('approvals') && !keysOf('leader').includes('issue-queue'))
    assert.ok(keysOf('storekeeper').includes('issue-queue') && keysOf('storekeeper').includes('approvals'))
    assert.ok(['requisitions-admin', 'workflow-admin', 'approvals', 'issue-queue'].every((key) => keysOf('admin').includes(key)))
    for (const role of ['employee', 'leader', 'storekeeper']) assert.ok(!keysOf(role).includes('workflow-admin') && !keysOf(role).includes('requisitions-admin'))
  })

  test('bottom bars put the requisition work where each role needs it', () => {
    assert.deepEqual(bar('employee'), ['requisition-new', 'requisitions', 'center:new', 'more'])
    assert.deepEqual(bar('leader'), ['dashboard', 'inspections', 'center:new', 'approvals', 'more'])
    assert.deepEqual(bar('admin'), ['dashboard', 'inspections', 'center:new', 'approvals', 'more'])
    assert.deepEqual(bar('storekeeper'), ['inventory-stock', 'issue-queue', 'center:inventory-stock', 'inventory-counts', 'more'])
  })

  test('badge sources are attached to cart, approvals and issue queue', () => {
    const badgeOf = (role, key) => navFor(role).all.find((item) => item.key === key)?.badge
    assert.equal(badgeOf('employee', 'requisition-new'), 'cart')
    assert.equal(badgeOf('leader', 'approvals'), 'approvals')
    assert.equal(badgeOf('storekeeper', 'issue-queue'), 'issue')
    assert.equal(badgeOf('admin', 'requisitions'), undefined)
  })

  test('requisition pages are grouped under their own heading in the More sheet', () => {
    const titles = navFor('admin').groups.map((group) => group.title)
    assert.ok(titles.includes('การเบิกของ'))
    assert.ok(navFor('admin').groups.find((group) => group.title === 'การเบิกของ').items.some((item) => item.key === 'requisitions-admin'))
    // Approval-workflow settings live with the requisition pages, and requisitions and warehouses come before system data.
    assert.ok(navFor('admin').groups.find((group) => group.title === 'การเบิกของ').items.some((item) => item.key === 'workflow-admin'))
    assert.ok(!navFor('admin').groups.find((group) => group.title === 'ข้อมูลระบบ').items.some((item) => item.key === 'workflow-admin'))
    assert.ok(titles.indexOf('การเบิกของ') < titles.indexOf('ข้อมูลระบบ') && titles.indexOf('คลังสินค้า') < titles.indexOf('ข้อมูลระบบ'))
  })
})

describe('activeSlotIndex', () => {
  test('a tab page maps to its tab, the centre page to the centre, a sheet-only page to more', () => {
    const { tabs } = navFor('admin')
    assert.equal(activeSlotIndex(tabs, 'dashboard'), 0)
    assert.equal(activeSlotIndex(tabs, 'inspections'), 1)
    assert.equal(activeSlotIndex(tabs, 'new'), 2)
    assert.equal(activeSlotIndex(tabs, 'approvals'), 3)
    assert.equal(activeSlotIndex(tabs, 'inventory-stock'), 4)
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
