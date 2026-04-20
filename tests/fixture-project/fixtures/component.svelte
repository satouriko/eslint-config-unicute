<script lang="ts">
  // Explicit `: string` + `let` never reassigned → double finding.
  // (`greeting`, not `name`, because `window.name` is @deprecated in
  // TS lib.dom and svelte-eslint-parser exposes the script scope to
  // `@typescript-eslint/no-deprecated` which would flag any local
  // binding named `name` as shadowing the deprecated global.)
  let greeting: string = 'world'
</script>

<h1>Hello {greeting}</h1>
