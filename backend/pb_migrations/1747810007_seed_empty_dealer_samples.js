/// <reference path="../pb_data/types.d.ts" />

/**
 * Provide a complete demo desk only where a dealer has no operating data.
 *
 * This is intentionally conservative: existing inventory, lender programs,
 * and dealer settings are never replaced or appended to. It repairs the
 * empty-production state without risking a live dealer's imported inventory
 * or negotiated lender programs. The sample lender programs are illustrative
 * only and must be replaced with current dealer rate sheets before quoting.
 */

const SAMPLE_INVENTORY = [
  ["SAMPLE01AAAA1000", "STK1000", 2012, "Honda", "Civic", "LX", 155000, 5500, 4000, 4800, 6200],
  ["SAMPLE02AAAA1001", "STK1001", 2013, "Ford", "Focus", "SE", 140000, 5800, 4200, 5100, 6500],
  ["SAMPLE03AAAA1002", "STK1002", 2011, "Toyota", "Corolla", "LE", 160000, 4900, 3500, 4200, 5800],
  ["SAMPLE04AAAA1003", "STK1003", 2015, "Nissan", "Altima", "S", 110000, 10500, 8800, 9800, 11500],
  ["SAMPLE05AAAA1004", "STK1004", 2016, "Hyundai", "Elantra", "SE", 95000, 9800, 8200, 9100, 10700],
  ["SAMPLE06AAAA1005", "STK1005", 2014, "Chevy", "Cruze", "LT", 105000, 8900, 7500, 8200, 9800],
  ["SAMPLE07AAAA1006", "STK1006", 2017, "Kia", "Soul", "Base", 88000, 11200, 9500, 10500, 12200],
  ["SAMPLE08AAAA1007", "STK1007", 2018, "Honda", "Accord", "Sport", 75000, 15500, 13800, 14800, 16800],
  ["SAMPLE09AAAA1008", "STK1008", 2016, "Jeep", "Renegade", "Latitude", 82000, 14800, 13000, 14000, 15900],
  ["SAMPLE10AAAA1009", "STK1009", 2017, "Ford", "Escape", "SE", 78000, 16000, 14100, 15200, 17200],
  ["SAMPLE11AAAA1010", "STK1010", 2019, "Nissan", "Rogue", "S", 70000, 16500, 14700, 15800, 17900],
  ["SAMPLE12AAAA1011", "STK1011", 2020, "Toyota", "Camry", "SE", 55000, 20500, 18200, 19500, 21800],
  ["SAMPLE13AAAA1012", "STK1012", 2018, "Jeep", "Wrangler", "Sport", 65000, 21000, 18800, 20000, 22500],
  ["SAMPLE14AAAA1013", "STK1013", 2019, "Subaru", "Outback", "2.5i", 68000, 19800, 17700, 18900, 21100],
  ["SAMPLE15AAAA1014", "STK1014", 2021, "Hyundai", "Kona", "SEL", 40000, 19200, 17300, 18400, 20500],
  ["SAMPLE16AAAA1015", "STK1015", 2019, "Ford", "F-150", "XLT", 72000, 25500, 23000, 24500, 27500],
  ["SAMPLE17AAAA1016", "STK1016", 2020, "Chevy", "Equinox", "LT", 48000, 24800, 22500, 23800, 26500],
  ["SAMPLE18AAAA1017", "STK1017", 2020, "Honda", "Civic", "LX", 35000, 22500, 19000, 20500, 23800],
  ["SAMPLE19AAAA1018", "STK1018", 2019, "Toyota", "Camry", "SE", 42000, 24000, 20500, 21800, 25000],
  ["SAMPLE20AAAA1019", "STK1019", 2021, "Ford", "Escape", "SEL", 28000, 26500, 23000, 24000, 27500],
  ["SAMPLE21AAAA1020", "STK1020", 2017, "BMW", "3 Series", "330i", 60000, 24000, 21500, 23000, 25800],
  ["SAMPLE22AAAA1021", "STK1021", 2021, "Mazda", "CX-5", "Touring", 35000, 26000, 23800, 25000, 27800],
  ["SAMPLE23AAAA1022", "STK1022", 2022, "Nissan", "Altima", "SR", 18000, 29000, 26000, 27500, 30500],
  ["SAMPLE24AAAA1023", "STK1023", 2020, "Honda", "CR-V", "EX-L", 32000, 31500, 28500, 29500, 32800],
  ["SAMPLE25AAAA1024", "STK1024", 2022, "Honda", "CR-V", "EX", 25000, 30500, 28000, 29500, 32000],
  ["SAMPLE26AAAA1025", "STK1025", 2019, "Toyota", "Highlander", "XLE", 58000, 29800, 27500, 28800, 31500],
  ["SAMPLE27AAAA1026", "STK1026", 2020, "Ford", "Explorer", "XLT", 52000, 31000, 28500, 30000, 32800],
  ["SAMPLE28AAAA1027", "STK1027", 2018, "Lexus", "RX", "350", 62000, 32000, 29000, 30800, 33500],
  ["SAMPLE29AAAA1028", "STK1028", 2021, "Tesla", "Model 3", "Standard Range", 38000, 34000, 31000, 32500, 35500],
  ["SAMPLE30AAAA1029", "STK1029", 2020, "BMW", "X3", "sDrive30i", 45000, 36000, 32800, 34500, 37500],
  ["SAMPLE31AAAA1030", "STK1030", 2019, "Chevy", "Tahoe", "LT", 70000, 35500, 32000, 34000, 37000],
  ["SAMPLE32AAAA1031", "STK1031", 2022, "Ford", "F-150", "Lariat", 30000, 40500, 37000, 39000, 42500],
  ["SAMPLE33AAAA1032", "STK1032", 2021, "Mercedes-Benz", "GLC", "300", 33000, 39000, 35800, 37500, 41000],
  ["SAMPLE34AAAA1033", "STK1033", 2020, "Jeep", "Grand Cherokee", "Limited", 48000, 38000, 34800, 36500, 39800],
  ["SAMPLE35AAAA1034", "STK1034", 2023, "Kia", "Telluride", "LX", 15000, 41000, 38000, 39500, 43000],
];

const SAMPLE_LENDERS = [
  {
    name: "Alliance CCU",
    maxPti: 20,
    bookValueSource: "Trade",
    tiers: [
      { name: "A Tier (2024+)", minFico: 720, minYear: 2024, maxTerm: 120, maxLtv: 125 },
      { name: "B Tier (2024+)", minFico: 680, maxFico: 719, minYear: 2024, maxTerm: 96, maxLtv: 125 },
      { name: "C Tier (2024+)", minFico: 640, maxFico: 679, minYear: 2024, maxTerm: 84, maxLtv: 125 },
      { name: "A Tier (2020-23)", minFico: 720, minYear: 2020, maxYear: 2023, maxTerm: 84, maxLtv: 125, maxMileage: 125000 },
      { name: "B Tier (2020-23)", minFico: 680, maxFico: 719, minYear: 2020, maxYear: 2023, maxTerm: 84, maxLtv: 125, maxMileage: 125000 },
      { name: "C Tier (2020-23)", minFico: 640, maxFico: 679, minYear: 2020, maxYear: 2023, maxTerm: 84, maxLtv: 125, maxMileage: 125000 },
      { name: "A Tier (2015-19)", minFico: 720, minYear: 2015, maxYear: 2019, maxTerm: 60, maxLtv: 125, maxMileage: 125000 },
      { name: "B Tier (2015-19)", minFico: 680, maxFico: 719, minYear: 2015, maxYear: 2019, maxTerm: 60, maxLtv: 125, maxMileage: 125000 },
      { name: "C Tier (2015-19)", minFico: 640, maxFico: 679, minYear: 2015, maxYear: 2019, maxTerm: 60, maxLtv: 125, maxMileage: 125000 },
    ],
  },
  {
    name: "Capital One",
    minIncome: 1500,
    maxPti: 20,
    bookValueSource: "Trade",
    tiers: [
      { name: "Prime (Book >= $25k)", minFico: 620, maxLtv: 120, maxTerm: 84, maxMileage: 150000, minAmountFinanced: 4000 },
      { name: "Non-Prime (Book >= $25k)", minFico: 500, maxFico: 619, maxLtv: 120, maxTerm: 84, maxMileage: 150000, minAmountFinanced: 4000 },
      { name: "Non-Prime (Book < $25k)", minFico: 500, maxFico: 619, maxLtv: 130, maxTerm: 84, maxMileage: 150000, minAmountFinanced: 4000 },
      { name: "All Tiers (Age <= 5yr, Amt > $20k)", minYear: 2020, minAmountFinanced: 20001, maxTerm: 84, maxMileage: 150000 },
      { name: "All Tiers (General)", maxTerm: 75, maxMileage: 150000 },
    ],
  },
  {
    name: "Crescent Bank",
    minIncome: 2000,
    minAmountFinanced: 7000,
    maxAmountFinanced: 45000,
    bookValueSource: "Trade",
    tiers: [
      { name: "General", minFico: 450, maxLtv: 140, maxTerm: 75, maxMileage: 120000, minYear: 2015 },
      { name: "Diesel", minFico: 450, maxLtv: 140, maxTerm: 75, maxMileage: 135000, minYear: 2015 },
    ],
  },
  {
    name: "Ford Credit",
    bookValueSource: "Trade",
    tiers: [
      { name: "New (Tier 0-2, FICO > 620)", minYear: 2023, minFico: 620, maxLtv: 135, maxTerm: 84, minAmountFinanced: 15000 },
      { name: "New (Tier 3-4, FICO < 620)", minYear: 2023, maxFico: 619, maxLtv: 110, maxTerm: 84, minAmountFinanced: 15000 },
      { name: "Used (FICO > 680)", minYear: 2022, maxYear: 2025, minFico: 680, maxLtv: 120, maxTerm: 84, minAmountFinanced: 15000 },
      { name: "Used (FICO 620-679)", minYear: 2022, maxYear: 2025, minFico: 620, maxFico: 679, maxLtv: 110, maxTerm: 84, minAmountFinanced: 15000 },
      { name: "Older Used", minYear: 2018, maxYear: 2021, maxTerm: 72, minAmountFinanced: 15000 },
    ],
  },
  {
    name: "Lake Trust CU",
    bookValueSource: "Retail",
    tiers: [
      { name: "New - Tier 1-3", minYear: 2023, minFico: 660, maxLtv: 145, maxTerm: 84 },
      { name: "New - Tier 4-5", minYear: 2023, maxFico: 659, maxLtv: 135, maxTerm: 84 },
      { name: "Used (2017-22) - Tier 1-3", minYear: 2017, maxYear: 2022, minFico: 660, maxLtv: 145, maxTerm: 84, maxMileage: 175000 },
      { name: "Used (2017-22) - Tier 4-5", minYear: 2017, maxYear: 2022, maxFico: 659, maxLtv: 135, maxTerm: 84, maxMileage: 175000 },
      { name: "Older (2016+) - Tier 1-3", minYear: 2016, minFico: 660, maxLtv: 145, maxTerm: 84, maxMileage: 175000 },
      { name: "Older (2016+) - Tier 4-5", minYear: 2016, maxFico: 659, maxLtv: 135, maxTerm: 84, maxMileage: 175000 },
    ],
  },
  {
    name: "PNC Bank",
    minAmountFinanced: 5000,
    bookValueSource: "Retail",
    tiers: [
      { name: "New (<= 72mo)", minYear: 2024, maxTerm: 72, maxLtv: 125, minFico: 680 },
      { name: "New (> 72mo)", minYear: 2024, minTerm: 73, maxTerm: 84, maxLtv: 115, minFico: 680 },
      { name: "Used", maxYear: 2023, maxTerm: 84, maxLtv: 115, minFico: 680, maxMileage: 125000 },
    ],
  },
  {
    name: "Santander",
    minIncome: 1750,
    maxPti: 22,
    minAmountFinanced: 5000,
    bookValueSource: "Trade",
    tiers: [
      { name: "Standard Program", minFico: 500, maxLtv: 145, maxTerm: 75, minYear: 2016, maxMileage: 120000 },
      { name: "84mo Program", minFico: 500, maxLtv: 120, maxTerm: 84, minYear: 2022, maxMileage: 60000 },
    ],
  },
  {
    name: "TD Auto Finance",
    minAmountFinanced: 7500,
    bookValueSource: "Trade",
    tiers: [
      { name: "Tier 1-2 (<= 75mo)", minFico: 680, maxTerm: 75, maxLtv: 140 },
      { name: "Tier 3 (<= 75mo)", minFico: 660, maxFico: 679, maxTerm: 75, maxLtv: 140 },
      { name: "Tier 4-5 (<= 75mo)", minFico: 620, maxFico: 659, maxTerm: 75, maxLtv: 120 },
      { name: "Tier 1-5 (> 75mo)", minFico: 620, minTerm: 76, maxTerm: 84, maxLtv: 120 },
    ],
  },
  {
    name: "Prestige Financial",
    minIncome: 3000,
    maxPti: 15,
    maxAmountFinanced: 40000,
    bookValueSource: "Trade",
    tiers: [{ name: "General", maxLtv: 140, maxTerm: 72, minYear: 2015, maxMileage: 125000 }],
  },
  {
    name: "Regional Acceptance",
    minIncome: 1900,
    bookValueSource: "Trade",
    tiers: [{ name: "Tier 1-7", maxLtv: 125, maxTerm: 84, minYear: 2015, maxMileage: 130000 }],
  },
  {
    name: "Credit Acceptance",
    maxPti: 25,
    bookValueSource: "Trade",
    tiers: [
      { name: "Platinum", minFico: 660, maxTerm: 84 },
      { name: "Gold", minFico: 600, maxFico: 659, maxTerm: 84 },
      { name: "Silver", minFico: 550, maxFico: 599, maxTerm: 84 },
      { name: "Standard", maxFico: 549, maxTerm: 84 },
    ],
  },
  {
    name: "Exeter",
    minIncome: 1700,
    maxPti: 21,
    minAmountFinanced: 6000,
    maxAmountFinanced: 50000,
    bookValueSource: "Trade",
    tiers: [
      { name: "ExeterPLUS", minFico: 620, maxLtv: 150, maxTerm: 78, minYear: 2012, maxMileage: 200000 },
      { name: "Exeter", minFico: 400, maxFico: 619, maxLtv: 150, maxTerm: 78, minYear: 2012, maxMileage: 200000 },
    ],
  },
  {
    name: "Global Lending",
    minIncome: 1800,
    maxPti: 24,
    minAmountFinanced: 7000,
    maxAmountFinanced: 55000,
    bookValueSource: "Trade",
    tiers: [
      { name: "T1-T4 (<= 80k miles)", minFico: 400, maxLtv: 135, maxTerm: 75, maxMileage: 80000 },
      { name: "T1-T4 (> 80k miles)", minFico: 400, maxLtv: 135, maxTerm: 72, minMileage: 80001, maxMileage: 180000 },
    ],
  },
];

const selectKnownFields = (collection, data) => {
  const safe = {};
  for (const [key, value] of Object.entries(data)) {
    if (collection.fields.getByName(key)) safe[key] = value;
  }
  return safe;
};

const dealerHasRecords = (records, dealerId) =>
  records.some((record) => record.getString("dealer") === dealerId);

migrate(
  (app) => {
    let dealers;
    let inventory;
    let lenderProfiles;
    let dealerSettings;

    try {
      dealers = app.findRecordsByFilter("dealers", "", "", 0, 0);
      inventory = app.findCollectionByNameOrId("inventory");
      lenderProfiles = app.findCollectionByNameOrId("lender_profiles");
      dealerSettings = app.findCollectionByNameOrId("dealer_settings");
    } catch (error) {
      console.log("[skip] seed_empty_dealer_samples: required collection is missing");
      return;
    }

    if (!lenderProfiles.fields.getByName("isSample")) {
      lenderProfiles.fields.add(new BoolField({ name: "isSample", required: false }));
      app.save(lenderProfiles);
      lenderProfiles = app.findCollectionByNameOrId("lender_profiles");
    }

    if (!dealers || dealers.length === 0) {
      console.log("[skip] seed_empty_dealer_samples: no dealer records yet");
      return;
    }

    const inventoryRecords = app.findRecordsByFilter("inventory", "", "", 0, 0);
    const lenderRecords = app.findRecordsByFilter("lender_profiles", "", "", 0, 0);
    const settingsRecords = app.findRecordsByFilter("dealer_settings", "", "", 0, 0);

    let seededDealers = 0;
    for (const dealer of dealers) {
      const dealerId = dealer.id;
      let seeded = false;

      if (!dealerHasRecords(inventoryRecords, dealerId)) {
        for (const [vin, stockNumber, year, make, model, trim, mileage, price, unitCost, jdPower, jdPowerRetail] of SAMPLE_INVENTORY) {
          const record = new Record(
            inventory,
            selectKnownFields(inventory, {
              dealer: dealerId,
              vin,
              stockNumber,
              year,
              make,
              model,
              trim,
              mileage,
              price,
              unitCost,
              jdPower,
              jdPowerRetail,
              status: "available",
              notes: "Sample inventory. Replace with the dealer's DMS import before quoting.",
            })
          );
          app.save(record);
        }
        seeded = true;
        console.log(`[seed] ${dealer.getString("name") || dealerId}: ${SAMPLE_INVENTORY.length} sample vehicles`);
      }

      if (!dealerHasRecords(lenderRecords, dealerId)) {
        for (const lender of SAMPLE_LENDERS) {
          const record = new Record(
            lenderProfiles,
            selectKnownFields(lenderProfiles, {
              dealer: dealerId,
              ...lender,
              active: true,
              isSample: true,
              generalNotes:
                "Sample program only. Terms are illustrative and must be verified against the lender's current rate sheet before quoting.",
            })
          );
          app.save(record);
        }
        seeded = true;
        console.log(`[seed] ${dealer.getString("name") || dealerId}: ${SAMPLE_LENDERS.length} sample lender profiles`);
      }

      if (!dealerHasRecords(settingsRecords, dealerId)) {
        const record = new Record(
          dealerSettings,
          selectKnownFields(dealerSettings, {
            dealer: dealerId,
            defaultTerm: 72,
            defaultApr: 8.9,
            defaultState: "MI",
            docFee: 280,
            cvrFee: 24,
            defaultStateFees: 31,
            outOfStateTransitFee: 10,
            ltvThresholds: { warn: 115, danger: 125, critical: 135 },
          })
        );
        app.save(record);
        seeded = true;
        console.log(`[seed] ${dealer.getString("name") || dealerId}: desk settings`);
      }

      if (seeded) seededDealers++;
    }

    console.log(`[ok] seed_empty_dealer_samples: initialized ${seededDealers}/${dealers.length} empty dealer(s)`);
  },
  () => {
    // Never delete sample records automatically: a dealer may have edited them
    // after bootstrap, and rollback must not erase operational data.
  }
);
