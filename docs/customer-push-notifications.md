# WaterNow customer push notifications

The customer PWA and Owner PWA use separate service-worker registrations and separate subscription tables:

- Customer app: root scope `/`, worker `/sw.js`, subscriptions in `push_subscriptions`.
- Owner app: scope `/admin/`, worker `/admin/sw.js`, subscriptions in `owner_push_subscriptions`.

Customer push messages must use the WaterNow PNG notification asset at
`/icons/icon-192-brand-v2.png` for both the notification icon and badge.
The asset is included in the customer service-worker shell so the current
worker can refresh it with the next service-worker activation.

A successful HTTP response from the web-push provider confirms provider
acceptance only. Device receipt must be confirmed separately on an Android
device; CI cannot claim that a phone displayed the notification.

When verifying delivery, check the customer subscription separately from
the Owner subscription and never send a production test broadcast unless the
recipient count has been constrained to the intended test device.
