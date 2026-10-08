/// <reference path="../pb_data/types.d.ts" />

// PocketBase NumberField stores null/omitted values as 0. Preserve the
// difference between no override and an explicitly selected zero rate.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("dealer_settings");
  if (collection.fields.getByName("customTaxRateEnabled")) return;
  collection.fields.add(new BoolField({ name: "customTaxRateEnabled" }));
  app.save(collection);
  let offset = 0;
  while (true) {
    const rows = app.findRecordsByFilter("dealer_settings", "customTaxRate > 0", "id", 500, offset);
    for (const record of rows) {
      record.set("customTaxRateEnabled", true);
      app.save(record);
    }
    if (rows.length < 500) break;
    offset += rows.length;
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("dealer_settings");
  const field = collection.fields.getByName("customTaxRateEnabled");
  if (field) { collection.fields.removeById(field.id); app.save(collection); }
});
