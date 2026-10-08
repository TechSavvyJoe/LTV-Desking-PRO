/// <reference path="../pb_data/types.d.ts" />

// Optional: old and imported units remain unknown until explicitly confirmed.
// Do not backfill from year, odometer, or inventory availability status.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("inventory");
  if (collection.fields.getByName("condition")) return;
  collection.fields.add(new SelectField({
    name: "condition", values: ["new", "used", "certified"], maxSelect: 1, required: false,
  }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("inventory");
  const field = collection.fields.getByName("condition");
  if (field) { collection.fields.removeById(field.id); app.save(collection); }
});
