<script setup lang="js">
// lang="js" violates our `vue/block-lang` rule (we enforce lang="ts").
// Smoke assertion: that's a LINT error, not a parser error — vue-eslint-
// parser must still successfully parse the SFC so subsequent rules can
// run and the violation is reported cleanly.
const msg = 'Hello'
console.log(msg)
</script>

<template>
  <div>{{ msg }}</div>
</template>
