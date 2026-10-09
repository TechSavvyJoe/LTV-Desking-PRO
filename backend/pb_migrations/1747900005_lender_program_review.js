/// <reference path="../pb_data/types.d.ts" />

// Add source review without fabricating provenance for existing programs.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("lender_profiles");
  const fields = [
    new BoolField({ name: "reviewRequired" }),
    new TextField({ name: "sourceReference", max: 500 }),
    new TextField({ name: "verifiedAt", max: 40 }),
    new TextField({ name: "expiresOn", max: 10 }),
  ];
  for (const field of fields) if (!collection.fields.getByName(field.name)) collection.fields.add(field);
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("lender_profiles");
  for (const name of ["reviewRequired", "sourceReference", "verifiedAt", "expiresOn"]) if (collection.fields.getByName(name)) collection.fields.removeByName(name);
  app.save(collection);
});
