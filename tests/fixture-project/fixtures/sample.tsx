// `export let` → `prefer-const` + `import-x/no-mutable-exports`
export let Greet = (props: { name: string }) => <div>Hello {props.name}</div>
