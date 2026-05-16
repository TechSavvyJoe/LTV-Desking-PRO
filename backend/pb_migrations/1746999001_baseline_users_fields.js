/// <reference path="../pb_data/types.d.ts" />

/**
 * Baseline migration to extend the default `users` auth collection with the
 * fields the app expects: firstName, lastName, phone, dealer (relation),
 * role (select).
 *
 * Idempotent at the field level: each `add` is gated on whether the field
 * already exists, so production (which has these fields) noops and CI (which
 * has only the PB default users collection) gets the missing fields.
 */
migrate(
  (app) => {
    let users;
    try {
      users = app.findCollectionByNameOrId("users");
    } catch (e) {
      console.log("[skip] users collection not found — PB should always create one");
      return;
    }

    const addIfMissing = (name, build) => {
      if (users.fields.getByName(name)) {
        console.log(`[skip] users.${name} already present`);
        return;
      }
      users.fields.add(build());
    };

    addIfMissing("firstName", () => new TextField({ name: "firstName", required: false, max: 100 }));
    addIfMissing("lastName", () => new TextField({ name: "lastName", required: false, max: 100 }));
    addIfMissing("phone", () => new TextField({ name: "phone", required: false, max: 30 }));

    if (!users.fields.getByName("dealer")) {
      let dealersId;
      try {
        dealersId = app.findCollectionByNameOrId("dealers").id;
      } catch (e) {
        console.log("[skip] dealers collection not found — cannot add users.dealer relation");
        return;
      }
      users.fields.add(
        new RelationField({
          name: "dealer",
          required: false,
          collectionId: dealersId,
          maxSelect: 1,
          cascadeDelete: false,
        })
      );
    }

    addIfMissing(
      "role",
      () =>
        new SelectField({
          name: "role",
          required: false,
          values: ["sales", "manager", "admin", "superadmin"],
          maxSelect: 1,
        })
    );

    app.save(users);
  },
  (app) => {
    let users;
    try {
      users = app.findCollectionByNameOrId("users");
    } catch (e) {
      return;
    }
    for (const name of ["firstName", "lastName", "phone", "dealer", "role"]) {
      if (users.fields.getByName(name)) {
        users.fields.removeByName(name);
      }
    }
    app.save(users);
  }
);
