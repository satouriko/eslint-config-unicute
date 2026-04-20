<script lang="ts">
  // Explicit `: string` + `let` never reassigned → double finding
  let name: string = 'world'
</script>

<h1>Hello {name}</h1>
