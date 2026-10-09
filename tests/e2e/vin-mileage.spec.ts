import { test, expect } from "@playwright/test";
import { authenticateAs, loginViaApi } from "./fixtures/auth";
import { appBackendUrl, USE_REAL_BACKEND } from "./fixtures/backend";

test("inventory preserves unknown mileage and explicit condition changes after reload", async ({
  page,
  request,
}) => {
  test.skip(!USE_REAL_BACKEND, "Requires persisted inventory.");
  const vin = "1HGCM82633A004352";
  await authenticateAs(page, request, "admin");
  await page.route("https://vpic.nhtsa.dot.gov/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        Results: [{ ErrorCode: "0", Make: "Honda", Model: "Accord VIN QA", ModelYear: "2003" }],
      }),
    })
  );
  await page.goto("/inventory");
  await page.getByRole("button", { name: "VIN decode", exact: true }).click();
  await page.getByLabel("Decode a VIN into inventory", { exact: true }).fill(vin);
  await page.getByRole("button", { name: "Decode", exact: true }).click();
  await expect(
    page.getByText("Success: Vehicle added to inventory", { exact: true })
  ).toBeVisible();
  const { token } = await loginViaApi(request, "admin");
  const headers = { Authorization: token };
  const recordsUrl = `${appBackendUrl()}/api/collections/inventory/records`;
  const response = await request.get(recordsUrl, { headers, params: { filter: `vin = '${vin}'` } });
  expect(response.ok()).toBe(true);
  const record = (await response.json()).items[0];
  expect(record.mileage).toBe(0);
  expect(record.mileageUnknown).toBe(true);
  try {
    await page.getByRole("button", { name: "VIN decode", exact: true }).click();
    await page.reload();
    await page.getByRole("textbox", { name: "Search inventory", exact: true }).fill(vin);
    const row = page.getByRole("row").filter({ hasText: "Honda Accord VIN QA" });
    await expect(row).toContainText("— mi");
    const condition = row.getByRole("combobox", {
      name: `Inventory condition for ${record.stockNumber}`,
      exact: true,
    });
    await expect(condition).toHaveValue("");
    await condition.selectOption("certified");
    await expect
      .poll(
        async () =>
          (await (await request.get(`${recordsUrl}/${record.id}`, { headers })).json()).condition
      )
      .toBe("certified");
    await page.reload();
    await page.getByRole("textbox", { name: "Search inventory", exact: true }).fill(vin);
    await expect(condition).toHaveValue("certified");
    const edited = await request.patch(`${recordsUrl}/${record.id}`, {
      headers,
      data: { mileage: 0, mileageUnknown: false },
    });
    expect(edited.ok()).toBe(true);
    await page.reload();
    await page.getByRole("textbox", { name: "Search inventory", exact: true }).fill(vin);
    await expect(row).toContainText("0 mi");
    await expect(condition).toHaveValue("certified");
    await condition.selectOption("");
    await expect
      .poll(
        async () =>
          (await (await request.get(`${recordsUrl}/${record.id}`, { headers })).json()).condition
      )
      .toBe("");
    await page.reload();
    await page.getByRole("textbox", { name: "Search inventory", exact: true }).fill(vin);
    await expect(condition).toHaveValue("");
  } finally {
    await request.delete(`${recordsUrl}/${record.id}`, { headers });
  }
});
