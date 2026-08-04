Public update assets for the Caddy/static host.

Do not publish a fake app-update.json. Create it only when a real APK has been
built, signed, uploaded, and hashed.

Expected production paths:

- https://chat.secureinchat.com/app-update.json
- https://chat.secureinchat.com/downloads/<signed-apk-name>.apk

The app accepts only HTTPS APK URLs and a 64-character hex SHA-256 value.
