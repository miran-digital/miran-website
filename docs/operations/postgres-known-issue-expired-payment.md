# Expired payment reservation invariant

Production readiness requirement: when starting a payment for an order whose active inventory reservation has already expired, the reservation release and order transition to `PAYMENT_FAILED` must commit before the API returns `CONFLICT`. A transaction must not release the reservation and then throw inside the same transaction, because that would roll the release back.

Required regression test: after an expired payment-start attempt, `stock_reserved` is zero, `stock_on_hand` is unchanged, order status is `PAYMENT_FAILED`, and no provider request is made.
