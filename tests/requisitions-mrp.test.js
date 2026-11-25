// MRP mode (MRP_INVENTORY_URL + MRP_INVENTORY_TOKEN): the catalog, checkout and "my requests" go to the MRP inventory; approving and
// issuing are done in MRP. A small fake MRP stands in for /api/integration/safety-stock and records what it was sent.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { ADMIN_PASSWORD, employeeBody, loginAs, startServer } from './helpers.js'

const TOKEN = 'test-integration-token'
const WAREHOUSE = '11111111-1111-1111-1111-111111111111'
const GLOVE_M = '22222222-2222-2222-2222-222222222222'
const seen = []
const requisitions = new Map()

function mrpRequisition(id, body, employee, status = 'submitted') {
  return {
    requisition: {
      id, number: 'RQ-2611-0001', status, warehouseId: body.warehouseId, warehouseCode: 'SAFETY-PPE', warehouseDepartment: 'SAFETY', requesterUserId: `ds:${employee.code}`,
      requesterName: employee.name, requesterDepartment: employee.department, neededBy: body.neededBy, purpose: body.reason, priority: 'NORMAL', costDepartment: employee.department,
      estimatedValue: 0, submittedAt: '2026-11-25T08:00:00Z', decidedByName: null, decidedAt: null, decisionNote: null, createdAt: '2026-11-25T08:00:00Z', documentNumbers: [],
      lines: body.lines.map((line, i) => ({ id: `line-${i}`, lineNo: i + 1, itemId: line.itemId, itemCode: 'PPE-GLOVE-M', itemName: 'ถุงมือผ้า', stockUnit: 'คู่', unitCode: 'คู่',
        qty: line.qty, qtyRequested: line.qty, qtyApproved: 0, qtyIssued: 0, qtyReturned: 0, qtyReserved: 0, qtyOutstanding: 0, note: null })),
    },
    type: 'ppe',
  }
}

const fakeMrp = http.createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const employee = req.headers['x-acting-user'] ? JSON.parse(decodeURIComponent(req.headers['x-acting-user'])) : null
  seen.push({ method: req.method, url: req.url, token: req.headers['x-integration-token'], employee, body: body ? JSON.parse(body) : null })
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
  if (req.headers['x-integration-token'] !== TOKEN) return send(401, { detail: 'Integration token missing or wrong.' })
  const url = new URL(req.url, 'http://mrp')
  const path = url.pathname.replace('/api/integration/safety-stock', '')
  if (req.method === 'GET' && path === '/catalog') {
    return send(200, {
      items: [{ itemId: 'glove', code: 'PPE-GLOVE', name: 'ถุงมือผ้า', itemType: 'ppe', unit: 'คู่', imageUrl: null, categoryName: 'มือ',
        variants: [{ itemId: GLOVE_M, code: 'PPE-GLOVE-M', label: 'M', available: 10, availableByWarehouse: { [WAREHOUSE]: 10 } }] },
        { itemId: 'para', code: 'MED-PARA', name: 'พาราเซตามอล', itemType: 'medicine', unit: 'แผง', imageUrl: null, categoryName: null,
          variants: [{ itemId: 'para', code: 'MED-PARA', label: '', available: 24, availableByWarehouse: {} }] }],
      warehouses: [{ id: WAREHOUSE, code: 'SAFETY-PPE', name: 'คลัง PPE', allowedItemTypes: ['ppe'] }],
    })
  }
  if (req.method === 'POST' && path === '/requisitions') {
    const answer = mrpRequisition('33333333-3333-3333-3333-333333333333', JSON.parse(body), employee)
    requisitions.set(answer.requisition.id, answer)
    return send(200, answer)
  }
  if (req.method === 'GET' && path === '/requisitions') return send(200, { requisitions: [...requisitions.values()] })
  const one = path.match(/^\/requisitions\/([^/]+)(\/cancel)?$/)
  if (one && requisitions.has(one[1])) {
    if (one[2]) requisitions.get(one[1]).requisition.status = 'cancelled'
    return send(200, requisitions.get(one[1]))
  }
  send(404, { detail: 'The requisition was not found.' })
})

let server
let baseUrl
before(async () => {
  await new Promise((resolve) => fakeMrp.listen(0, '127.0.0.1', resolve))
  server = await startServer({ MRP_INVENTORY_URL: `http://127.0.0.1:${fakeMrp.address().port}/`, MRP_INVENTORY_TOKEN: TOKEN })
  baseUrl = server.baseUrl
})
after(async () => {
  await server?.stop()
  fakeMrp.close()
})

const rq = (client, method, url, body) => client.call(method, `/api/requisitions${url}`, body)

async function employee() {
  const admin = await loginAs(baseUrl, 'admin', ADMIN_PASSWORD)
  assert.equal((await admin.call('POST', '/api/admin/employees', { ...employeeBody('E1001', 'สมชาย ใจดี'), departmentTh: 'ฝ่ายผลิต' })).status, 201)
  assert.equal((await admin.call('POST', '/api/admin/users', { name: 'สมชาย ใจดี', employeeCode: 'E1001', password: 'Req-pass-12', role: 'employee' })).status, 201)
  return loginAs(baseUrl, 'e1001', 'Req-pass-12')
}

describe('requisitions through MRP', () => {
  test('the employee keeps the cart here, the request goes to MRP with the token and who they are, approving stays in MRP', async () => {
    const client = await employee()
    assert.deepEqual((await rq(client, 'GET', '/mode')).json, { mode: 'mrp' })

    const catalog = await rq(client, 'GET', '/catalog?type=ppe')
    assert.equal(catalog.status, 200)
    assert.deepEqual(catalog.json.items.map((item) => [item.sku, item.variants.map((v) => [v.label, v.available])]), [['PPE-GLOVE', [['M', 10]]]])

    assert.equal((await rq(client, 'PUT', '/cart/lines', { type: 'medicine', variantId: GLOVE_M, qty: 1 })).status, 400)   // a glove is not medicine
    const cart = await rq(client, 'PUT', '/cart/lines', { type: 'ppe', variantId: GLOVE_M, qty: 2 })
    assert.deepEqual(cart.json.cart.lines.map((line) => [line.sku, line.variantLabel, line.qty, line.active]), [['PPE-GLOVE', 'M', 2, true]])
    assert.equal((await rq(client, 'GET', '/badges')).json.cart, 1)

    const warehouses = await rq(client, 'GET', '/warehouses?type=ppe')
    assert.deepEqual(warehouses.json.warehouses.map((w) => [w.code, w.covered, w.total]), [['SAFETY-PPE', 1, 1]])

    const checkout = await rq(client, 'POST', '/checkout', { type: 'ppe', warehouseId: WAREHOUSE, reason: 'งานล้างถัง', neededBy: '' })
    assert.equal(checkout.status, 201, JSON.stringify(checkout.json))
    assert.equal(checkout.json.requisition.status, 'in_approval')
    const sent = seen.find((call) => call.method === 'POST' && call.url.endsWith('/requisitions'))
    assert.equal(sent.token, TOKEN)
    assert.deepEqual(sent.employee, { code: 'E1001', name: 'สมชาย ใจดี', department: 'ฝ่ายผลิต' })
    assert.deepEqual(sent.body.lines, [{ itemId: GLOVE_M, qty: 2 }])
    assert.equal((await rq(client, 'GET', '/cart?type=ppe')).json.cart.lines.length, 0)   // the cart is emptied once MRP has it

    const mine = await rq(client, 'GET', '/mine')
    assert.deepEqual(mine.json.requisitions.map((r) => [r.number, r.status, r.type, r.totalQty]), [['RQ-2611-0001', 'in_approval', 'ppe', 2]])
    const id = checkout.json.requisition.id
    assert.equal((await rq(client, 'GET', `/${id}`)).json.requisition.lines[0].qtyRequested, 2)

    assert.equal((await rq(client, 'POST', `/${id}/approve`, {})).status, 410)   // approving happens in MRP
    const cancelled = await rq(client, 'POST', `/${id}/cancel`, { reason: 'ไม่ใช้แล้ว' })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.json.requisition.status, 'cancelled')
  })

  test('managers find nothing waiting here and bulk approval points to MRP', async () => {
    const leader = await loginAs(baseUrl, 'leader', 'Leader-test-1')
    assert.deepEqual((await rq(leader, 'GET', '/inbox')).json, { requisitions: [] })
    assert.deepEqual((await rq(leader, 'GET', '/issue-queue')).json, { requisitions: [] })
    assert.equal((await rq(leader, 'POST', '/bulk-approve', { ids: ['x'] })).status, 410)
  })
})
