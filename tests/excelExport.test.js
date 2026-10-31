import request from "supertest";
import ExcelJS from "exceljs";
import app from "../src/app.js";
import { User } from "../src/models/userModel.js";
import { WorkoutLog } from "../src/models/workoutLogModel.js";
import { Recovery } from "../src/models/recoveryModel.js";
it("downloads an owner-scoped workbook with typed set values and safely literal text", async () => {
  const user = await User.create({
    name: "Excel Athlete",
    email: "excel@test.app",
    passwordHash: "Password123!",
    roles: ["athlete"],
  });
  const other = await User.create({
    name: "Other Athlete",
    email: "other@test.app",
    passwordHash: "Password123!",
    roles: ["athlete"],
  });
  await WorkoutLog.create({
    athleteId: user._id,
    date: new Date("2026-10-31T10:00:00Z"),
    items: [{ exerciseId: user._id, sets: [{ reps: 12, weightKg: 42.5 }] }],
    notes: '=HYPERLINK("https://invalid.example")',
  });
  await Recovery.create({
    athleteId: user._id,
    date: "2026-10-31",
    source: "manual",
    sleepMinutes: 430,
  });
  await Recovery.create({
    athleteId: other._id,
    date: "2026-10-31",
    source: "manual",
    sleepMinutes: 222,
  });
  const result = await request(app)
    .get("/api/v1/users/me/export.xlsx")
    .set("Authorization", `Bearer ${user.generateAccessToken()}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    });
  expect(result.status).toBe(200);
  expect(result.headers["content-type"]).toContain("spreadsheetml");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(result.body);
  expect(book.getWorksheet("Logged sets").getCell("F2").value).toBe(12);
  expect(book.getWorksheet("Logged sets").getCell("G2").value).toBe(42.5);
  expect(book.getWorksheet("Recovery").rowCount).toBe(2);
  expect(book.getWorksheet("Recovery").getCell("D2").value).toBe(430);
  const note = book.getWorksheet("Logged sessions").getCell("I2");
  expect(typeof note.value).toBe("string");
  expect(note.formula).toBeUndefined();
  expect(
    JSON.stringify(book.getWorksheet("Profile").getSheetValues()),
  ).not.toMatch(/passwordHash|kioskPinHash/);
});
