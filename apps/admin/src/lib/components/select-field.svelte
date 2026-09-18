<script lang="ts">
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Select from "$lib/components/ui/select/index.js";

  let {
    name,
    label,
    description,
    value,
    options,
  }: {
    name: string;
    label: string;
    description?: string;
    value: string;
    options: { value: string; label: string }[];
  } = $props();

  const id = $props.id();
  let selected = $state(value);
  const selectedLabel = $derived(options.find((option) => option.value === selected)?.label ?? "選択してください");
</script>

<Field.Field>
  <Field.FieldLabel for="{name}-{id}">{label}</Field.FieldLabel>
  <!-- `name` is what makes bits-ui render the hidden input this form actually submits. -->
  <Select.Root type="single" {name} bind:value={selected}>
    <Select.Trigger id="{name}-{id}" class="w-full">{selectedLabel}</Select.Trigger>
    <Select.Content>
      <Select.Group>
        {#each options as option (option.value)}
          <Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
  {#if description}
    <Field.FieldDescription>{description}</Field.FieldDescription>
  {/if}
</Field.Field>
