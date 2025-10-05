(define-constant ERR_NOT_AUTHORIZED u100)
(define-constant ERR_INVALID_FARM_ID u101)
(define-constant ERR_INVALID_PROOF u102)
(define-constant ERR_INVALID_CRITERIA u103)
(define-constant ERR_AUDIT_ALREADY_SUBMITTED u104)
(define-constant ERR_INVALID_TIMESTAMP u105)
(define-constant ERR_CRITERIA_NOT_FOUND u106)
(define-constant ERR_AUDIT_NOT_FOUND u107)
(define-constant ERR_INVALID_AUTHORITY u108)
(define-constant ERR_INVALID_STATUS u109)
(define-constant ERR_INVALID_ZKP_PARAM u110)

(define-data-var contract-owner principal tx-sender)
(define-data-var authority-contract (optional principal) none)

(define-map audits
  { farm-id: (string-ascii 50), audit-id: uint }
  {
    proof-hash: (buff 32),
    criteria-id: uint,
    timestamp: uint,
    submitter: principal,
    status: (string-ascii 20),
    result: bool
  }
)

(define-map audit-criteria
  uint
  {
    name: (string-ascii 100),
    threshold: uint,
    description: (string-ascii 200),
    created-by: principal,
    created-at: uint
  }
)

(define-map audit-counter
  { farm-id: (string-ascii 50) }
  { count: uint }
)

(define-read-only (get-audit (farm-id (string-ascii 50)) (audit-id uint))
  (map-get? audits { farm-id: farm-id, audit-id: audit-id })
)

(define-read-only (get-criteria (criteria-id uint))
  (map-get? audit-criteria criteria-id)
)

(define-read-only (get-audit-count (farm-id (string-ascii 50)))
  (default-to { count: u0 } (map-get? audit-counter { farm-id: farm-id }))
)

(define-private (validate-farm-id (farm-id (string-ascii 50)))
  (if (and (> (len farm-id) u0) (<= (len farm-id) u50))
      (ok true)
      (err ERR_INVALID_FARM_ID))
)

(define-private (validate-proof-hash (proof-hash (buff 32)))
  (if (> (len proof-hash) u0)
      (ok true)
      (err ERR_INVALID_PROOF))
)

(define-private (validate-criteria-id (criteria-id uint))
  (if (is-some (map-get? audit-criteria criteria-id))
      (ok true)
      (err ERR_CRITERIA_NOT_FOUND))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR_INVALID_TIMESTAMP))
)

(define-private (validate-status (status (string-ascii 20)))
  (if (or (is-eq status "pending") (is-eq status "verified") (is-eq status "rejected"))
      (ok true)
      (err ERR_INVALID_STATUS))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR_NOT_AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR_NOT_AUTHORIZED))
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR_INVALID_AUTHORITY))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (add-criteria (name (string-ascii 100)) (threshold uint) (description (string-ascii 200)))
  (let
    (
      (criteria-id (len (map-keys audit-criteria)))
    )
    (asserts! (is-some (var-get authority-contract)) (err ERR_NOT_AUTHORIZED))
    (asserts! (> (len name) u0) (err ERR_INVALID_CRITERIA))
    (asserts! (> threshold u0) (err ERR_INVALID_CRITERIA))
    (map-set audit-criteria criteria-id
      {
        name: name,
        threshold: threshold,
        description: description,
        created-by: tx-sender,
        created-at: block-height
      }
    )
    (ok criteria-id)
  )
)

(define-public (submit-audit (farm-id (string-ascii 50)) (proof-hash (buff 32)) (criteria-id uint))
  (let
    (
      (audit-count (get count (get-audit-count farm-id)))
      (audit-exists (map-get? audits { farm-id: farm-id, audit-id: audit-count }))
    )
    (try! (validate-farm-id farm-id))
    (try! (validate-proof-hash proof-hash))
    (try! (validate-criteria-id criteria-id))
    (asserts! (is-none audit-exists) (err ERR_AUDIT_ALREADY_SUBMITTED))
    (asserts! (is-some (var-get authority-contract)) (err ERR_NOT_AUTHORIZED))
    (map-set audits
      { farm-id: farm-id, audit-id: audit-count }
      {
        proof-hash: proof-hash,
        criteria-id: criteria-id,
        timestamp: block-height,
        submitter: tx-sender,
        status: "pending",
        result: false
      }
    )
    (map-set audit-counter
      { farm-id: farm-id }
      { count: (+ audit-count u1) }
    )
    (print { event: "audit-submitted", farm-id: farm-id, audit-id: audit-count })
    (ok audit-count)
  )
)

(define-public (verify-audit (farm-id (string-ascii 50)) (audit-id uint) (result bool))
  (let
    (
      (audit (unwrap! (map-get? audits { farm-id: farm-id, audit-id: audit-id }) (err ERR_AUDIT_NOT_FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR_NOT_AUTHORIZED)))
    )
    (asserts! (is-eq tx-sender authority) (err ERR_NOT_AUTHORIZED))
    (try! (validate-farm-id farm-id))
    (map-set audits
      { farm-id: farm-id, audit-id: audit-id }
      {
        proof-hash: (get proof-hash audit),
        criteria-id: (get criteria-id audit),
        timestamp: (get timestamp audit),
        submitter: (get submitter audit),
        status: (if result "verified" "rejected"),
        result: result
      }
    )
    (print { event: "audit-verified", farm-id: farm-id, audit-id: audit-id, result: result })
    (ok true)
  )
)