/// <reference path="../pb_data/types.d.ts" />

// NumberField cannot represent missing mileage. Keep that provenance separate
// from a genuine entered zero. Existing records retain their recorded values.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("inventory");
  if (collection.fields.getByName("mileageUnknown")) return;
  collection.fields.add(new BoolField({ name: "mileageUnknown" }));
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("inventory");
  const field = collection.fields.getByName("mileageUnknown");
  if (field) { collection.fields.removeById(field.id); app.save(collection); }
});
