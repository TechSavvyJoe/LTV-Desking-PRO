/// <reference path="../pb_data/types.d.ts" />

// Migration: Extend users collection with dealer association and roles
migrate(
  (db) => {
    const dao = new Dao(db);
    const usersCollection = dao.findCollectionByNameOrId("users");

    // Add dealer relation
    usersCollection.schema.push({
      name: "dealer",
      type: "relation",
      required: true,
      options: {
        collectionId: "dealers",
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
        displayFields: ["name"],
      },
    });

    // Add role field
    usersCollection.schema.push({
      name: "role",
      type: "select",
      required: true,
      options: {
        maxSelect: 1,
        values: ["sales", "manager", "admin", "superadmin"],
      },
    });

    // Add first name
    usersCollection.schema.push({
      name: "firstName",
      type: "text",
      required: true,
      options: { min: 1, max: 50 },
    });

    // Add last name
    usersCollection.schema.push({
      name: "lastName",
      type: "text",
      required: true,
      options: { min: 1, max: 50 },
    });

    // Add phone
    usersCollection.schema.push({
      name: "phone",
      type: "text",
      required: false,
      options: { max: 20 },
    });

    return dao.saveCollection(usersCollection);
  },
  (db) => {
    const dao = new Dao(db);
    const usersCollection = dao.findCollectionByNameOrId("users");

    // Remove added fields
    usersCollection.schema = usersCollection.schema.filter(
      (f) =>
        !["dealer", "role", "firstName", "lastName", "phone"].includes(f.name)
    );

    return dao.saveCollection(usersCollection);
  }
);
