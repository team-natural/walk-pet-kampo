<script lang="ts">
  import BooleanField from "$lib/components/boolean-field.svelte";
  import EditSheet from "$lib/components/edit-sheet.svelte";
  import SelectField from "$lib/components/select-field.svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { STATUS_MAPS } from "$lib/status";
  import type { DogDetail } from "$lib/view-models/dog";

  // SYS-10's cross-organization edit. Deliberately not every column: the platform corrects what
  // affects safety and visibility; name, breed, photos and copy stay the shelter's to write.
  let { dog, action }: { dog: DogDetail; action: string } = $props();

  const id = $props.id();
  const adoptionOptions = Object.entries(STATUS_MAPS.dog).map(([value, meta]) => ({ value, label: meta.label }));
  const experienceOptions = [
    { value: "none", label: "不問" },
    { value: "some", label: "多少必要" },
    { value: "experienced", label: "経験者向け" },
  ];
</script>

<EditSheet {action} triggerLabel="編集" title="{dog.name} を編集" description="運営として掲載内容を是正します。変更は操作履歴に記録され、団体に通知されます。">
  <SelectField name="adoptionStatus" label="里親募集の状態" value={dog.adoptionStatus} options={adoptionOptions} />
  <SelectField name="requiredExperience" label="必要な経験" value={dog.requiredExperience} options={experienceOptions} />

  <Field.FieldSet>
    <Field.FieldLegend>掲載とおさんぽの可否</Field.FieldLegend>
    <BooleanField name="isPublished" label="公開する" description="外すと公開サイトの一覧と検索から消えます。" value={dog.isPublished} />
    <BooleanField name="walkEligible" label="おさんぽに参加できる" value={dog.walkEligible} />
    <BooleanField name="beginnerAllowed" label="初心者でも参加できる" value={dog.beginnerAllowed} />
    <BooleanField name="childAllowed" label="お子さま同伴で参加できる" value={dog.childAllowed} />
    <BooleanField name="multiDogAllowed" label="多頭同時のおさんぽができる" value={dog.multiDogAllowed} />
  </Field.FieldSet>

  <Field.Field>
    <Field.FieldLabel for="internalNotes-{id}">団体内メモ</Field.FieldLabel>
    <Textarea id="internalNotes-{id}" name="internalNotes" rows={4} value={dog.internalNotes ?? ""} />
    <Field.FieldDescription>公開サイトには表示されません。健康・安全に関わる申し送りです。</Field.FieldDescription>
  </Field.Field>
</EditSheet>
