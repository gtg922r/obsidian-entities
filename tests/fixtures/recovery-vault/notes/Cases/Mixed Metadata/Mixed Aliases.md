---
aliases:
  - Valid Mixed Alias
  - 42
  - false
  - { unexpected: object }
active: null
score: "0"
username: [valid-user, 0, false]
---
# Mixed Aliases

Only deliberate string aliases should become labels; malformed list entries
must not crash lookup. String zero and null are distinct from numeric zero.
