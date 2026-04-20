<script setup lang="ts">
// Explicit `: string` on a string literal → `@typescript-eslint/no-inferrable-types`
const msg: string = 'Hello'
</script>

<template>
  <div>{{ msg }}</div>
</template>
