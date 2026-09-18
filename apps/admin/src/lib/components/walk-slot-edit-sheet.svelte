<script lang="ts">
  import BooleanField from "$lib/components/boolean-field.svelte";
  import EditSheet from "$lib/components/edit-sheet.svelte";
  import SelectField from "$lib/components/select-field.svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { STATUS_MAPS } from "$lib/status";
  import type { WalkSlotDetail } from "$lib/view-models/walk-slot";

  // SYS-12's cross-organization edit. F-06-04 names capacity as the field the platform changes;
  // the date, place and fee stay the shelter's, since changing those invalidates the reservations.
  // Not `slot`: Astro reserves that attribute name, so a prop called `slot` is typed as a string
  // at every call site and fails to compile.
  let { walkSlot, action }: { walkSlot: WalkSlotDetail; action: string } = $props();

  const id = $props.id();
  const statusOptions = Object.entries(STATUS_MAPS.walkSlot).map(([value, meta]) => ({ value, label: meta.label }));
  const experienceOptions = [
    { value: "none", label: "不問" },
    { value: "some", label: "多少必要" },
    { value: "experienced", label: "経験者向け" },
  ];
</script>

<EditSheet {action} triggerLabel="編集" title="{walkSlot.title} を編集" description="運営として募集内容を是正します。変更は操作履歴に記録され、団体に通知されます。">
  <SelectField name="status" label="募集の状態" value={walkSlot.status} description="「開催中止」にすると予約済みの参加者に連絡と返金が行われます。" options={statusOptions} />

  <Field.Field>
    <Field.FieldLabel for="capacity-{id}">定員</Field.FieldLabel>
    <Input id="capacity-{id}" name="capacity" type="number" inputmode="numeric" min={walkSlot.reservedCount} max={20} value={walkSlot.capacity} required />
    <Field.FieldDescription>すでに {walkSlot.reservedCount} 名の予約があるため、それ未満にはできません。</Field.FieldDescription>
  </Field.Field>

  <SelectField name="requiredExperience" label="必要な経験" value={walkSlot.requiredExperience} options={experienceOptions} />

  <Field.Field>
    <Field.FieldLabel for="minAge-{id}">参加できる年齢</Field.FieldLabel>
    <Input id="minAge-{id}" name="minAge" type="number" inputmode="numeric" min={0} max={100} value={walkSlot.minAge ?? ""} />
    <Field.FieldDescription>歳以上。空欄で制限なしになります。</Field.FieldDescription>
  </Field.Field>

  <Field.FieldSet>
    <Field.FieldLegend>参加条件</Field.FieldLegend>
    <BooleanField name="beginnerAllowed" label="初心者でも参加できる" value={walkSlot.beginnerAllowed} />
    <BooleanField name="childAllowed" label="お子さま同伴で参加できる" value={walkSlot.childAllowed} />
    <BooleanField name="staffAccompanied" label="スタッフが同行する" value={walkSlot.staffAccompanied} />
  </Field.FieldSet>

  <Field.Field>
    <Field.FieldLabel for="precautions-{id}">注意事項</Field.FieldLabel>
    <Textarea id="precautions-{id}" name="precautions" rows={4} value={walkSlot.precautions ?? ""} />
    <Field.FieldDescription>公開サイトの募集ページに表示されます。</Field.FieldDescription>
  </Field.Field>
</EditSheet>
