<script setup lang="tsx">
// Explicit `: string` → `@typescript-eslint/no-inferrable-types`
const label: string = 'Hello'
const Greeting = () => <div>{label}</div>
</script>

<template>
  <Greeting />
</template>
