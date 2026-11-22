# Not a trap

<script>window.__pwned = 'script'</script>

<img src="x" onerror="window.__pwned = 'img'">

A [bad link](javascript:window.__pwned='link') and a [data link](data:text/html,<b>x</b>) are shown as text.

**<b onclick="window.__pwned='b'">bold markup</b>** stays text.
