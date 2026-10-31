import ExcelJS from "exceljs";
const value = (x) =>
  x == null
    ? ""
    : x instanceof Date
      ? x
      : typeof x === "object"
        ? x._bsontype
          ? String(x)
          : JSON.stringify(x)
        : typeof x === "string"
          ? x.slice(0, 30000)
          : x;
const id = (x) => (x ? String(x._id || x) : "");
function add(workbook, name, headers, rows) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row.map(value)));
  sheet.getRow(1).font = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF77518B" },
  };
  sheet.getRow(1).height = 28;
  sheet.columns.forEach((column, i) => {
    column.width = /notes|message|description|summary|text|body|value/i.test(
      headers[i],
    )
      ? 55
      : /date|time|id/i.test(headers[i])
        ? 25
        : 22;
    column.alignment = { vertical: "top", wrapText: true };
  });
  sheet.eachRow((row, index) => {
    if (index > 1) {
      row.font = { name: "Calibri", size: 11, color: { argb: "FF292330" } };
      if (index % 2 === 0)
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7F4FA" },
        };
      row.eachCell((cell) => {
        if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd hh:mm";
      });
    }
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: headers.length },
  };
  return sheet;
}
function flatten(input, prefix = "") {
  return Object.entries(input || {}).flatMap(([key, v]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    return v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date) &&
      !v._bsontype
      ? flatten(v, label)
      : [[label, value(v)]];
  });
}
export function buildExportWorkbook(data, exerciseNames = {}) {
  const book = new ExcelJS.Workbook();
  book.creator = "Rhythm";
  book.created = new Date();
  book.subject = "Private account and training export";
  add(
    book,
    "Export notes",
    ["Field", "Details"],
    [
      ["Exported at", new Date()],
      ["Account", data.user.email],
      [
        "Contents",
        "Private account records, workouts, logs, recovery, attendance, conversations and marketplace activity.",
      ],
      [
        "Dates",
        "Date cells display the stored timestamp. Recovery dates are calendar dates.",
      ],
      [
        "Photos",
        "This workbook includes photo metadata. Use the JSON download for raw photo content.",
      ],
      [
        "Text",
        "Very long text cells are limited to 30,000 characters. The JSON export retains full records.",
      ],
      [
        "Privacy",
        "No passwords, authentication secrets or kiosk PIN hashes are included. Keep this file private.",
      ],
    ],
  );
  add(book, "Profile", ["Field", "Value"], flatten(data.user));
  const name = (exerciseId) => exerciseNames[id(exerciseId)] || id(exerciseId);
  add(
    book,
    "Workouts",
    [
      "Workout ID",
      "Date",
      "Title",
      "Status",
      "Assigned by",
      "Exercises",
      "Assigned sets",
    ],
    data.workouts.map((w) => [
      id(w),
      w.date,
      w.title,
      w.status,
      w.assignedBy,
      w.items.length,
      w.items.reduce((n, i) => n + i.sets, 0),
    ]),
  );
  add(
    book,
    "Workout targets",
    [
      "Workout ID",
      "Title",
      "Date",
      "Exercise",
      "Exercise ID",
      "Sets",
      "Reps",
      "Target weight (kg)",
      "Rest (sec)",
      "Notes",
    ],
    data.workouts.flatMap((w) =>
      w.items.map((i) => [
        id(w),
        w.title,
        w.date,
        name(i.exerciseId),
        id(i.exerciseId),
        i.sets,
        i.reps,
        i.targetWeightKg,
        i.restSec,
        i.notes,
      ]),
    ),
  );
  const titles = Object.fromEntries(data.workouts.map((w) => [id(w), w.title]));
  add(
    book,
    "Logged sessions",
    [
      "Log ID",
      "Date",
      "Workout",
      "Workout ID",
      "Duration (min)",
      "Effort (1-10)",
      "Pain recorded",
      "Source",
      "Notes",
    ],
    data.logs.map((l) => [
      id(l),
      l.date,
      titles[id(l.workoutId)] || "",
      id(l.workoutId),
      l.durationMin,
      l.perceivedEffort,
      l.painFlag,
      l.source,
      l.notes,
    ]),
  );
  add(
    book,
    "Logged sets",
    [
      "Log ID",
      "Date",
      "Exercise",
      "Exercise ID",
      "Set number",
      "Reps",
      "Weight (kg)",
    ],
    data.logs.flatMap((l) =>
      l.items.flatMap((i) =>
        i.sets.map((set, index) => [
          id(l),
          l.date,
          name(i.exerciseId),
          id(i.exerciseId),
          index + 1,
          set.reps,
          set.weightKg,
        ]),
      ),
    ),
  );
  add(
    book,
    "Recovery",
    [
      "Date",
      "Source",
      "Source label",
      "Sleep (min)",
      "Resting HR (bpm)",
      "HRV (ms)",
      "Steps",
      "Fatigue (1-10)",
      "Soreness (1-10)",
      "Notes",
    ],
    data.recovery.map((r) => [
      r.date,
      r.source,
      r.sourceLabel,
      r.sleepMinutes,
      r.restingHeartRate,
      r.hrvMs,
      r.steps,
      r.fatigue,
      r.soreness,
      r.notes,
    ]),
  );
  add(
    book,
    "Daily log",
    [
      "Date",
      "Water (ml)",
      "Weight (kg)",
      "Mood (1-5)",
      "Energy (1-5)",
      "Stress (1-5)",
      "Note",
    ],
    (data.dailyLogs || []).map((d) => [
      d.date,
      d.waterMl,
      d.weightKg,
      d.mood,
      d.energy,
      d.stress,
      d.note,
    ]),
  );
  add(
    book,
    "Food",
    ["Date", "Meal", "Food", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)"],
    (data.dailyLogs || []).flatMap((d) =>
      (d.foods || []).map((f) => [
        d.date,
        f.meal,
        f.name,
        f.calories,
        f.proteinG,
        f.carbsG,
        f.fatG,
      ]),
    ),
  );
  add(
    book,
    "Attendance",
    ["Check-in ID", "Gym ID", "Timestamp", "Source"],
    data.checkIns.map((c) => [id(c), id(c.gymId), c.timestamp, c.source]),
  );
  const threads = [...data.conversations];
  if (
    data.conversation &&
    !threads.some((t) => id(t.legacyId) === id(data.conversation))
  )
    threads.push({ ...data.conversation, title: "Earlier conversation" });
  add(
    book,
    "Conversations",
    [
      "Conversation ID",
      "Title",
      "Archived",
      "Message date",
      "Role",
      "Status",
      "Message",
      "Photo ID",
    ],
    threads.flatMap((t) =>
      (t.messages || []).map((m) => [
        id(t),
        t.title,
        !!t.archived,
        m.at,
        m.role,
        m.status || "complete",
        m.text,
        id(m.photoId),
      ]),
    ),
  );
  add(
    book,
    "Training reviews",
    [
      "Review ID",
      "Created at",
      "Trigger",
      "Status",
      "Approval",
      "Readiness score",
      "Target coverage (%)",
      "Summary",
      "Reason",
    ],
    data.reviews.map((r) => [
      id(r),
      r.createdAt,
      r.trigger,
      r.status,
      r.approval,
      r.rules?.readiness?.score,
      r.rules?.completion?.coverage,
      r.analysis?.summary,
      r.analysis?.reason,
    ]),
  );
  add(
    book,
    "Notifications",
    ["Notification ID", "Date", "Type", "Title", "Body", "Read at", "Link"],
    data.notifications.map((n) => [
      id(n),
      n.createdAt,
      n.type,
      n.title,
      n.body,
      n.readAt,
      n.href,
    ]),
  );
  add(
    book,
    "Marketplace requests",
    [
      "Request ID",
      "Listing ID",
      "Listing title",
      "Date",
      "Status",
      "Customer ID",
      "Provider ID",
      "Listed price",
      "Currency",
      "Message",
      "Response",
      "Demo",
    ],
    data.marketplaceRequests.map((r) => [
      id(r),
      id(r.listingId),
      r.titleSnapshot,
      r.createdAt,
      r.status,
      id(r.customerId),
      id(r.providerId),
      r.priceMinor / 100,
      r.currency,
      r.message,
      r.responseNote,
      r.isDemo,
    ]),
  );
  add(
    book,
    "Payments",
    [
      "Payment record ID",
      "Request ID",
      "Created at",
      "Paid at",
      "Title",
      "Amount",
      "Currency",
      "Mode",
      "Status",
      "Fulfilment",
      "Gateway order",
      "Gateway payment",
      "Settlement",
    ],
    data.payments.map((p) => [
      id(p),
      id(p.requestId),
      p.createdAt,
      p.paidAt,
      p.title,
      p.amount / 100,
      p.currency,
      p.mode,
      p.status,
      p.fulfillment,
      p.orderId,
      p.paymentId,
      p.settlementStatus,
    ]),
  );
  if (data.coachProfile)
    add(
      book,
      "Public coach profile",
      ["Field", "Value"],
      flatten(data.coachProfile),
    );
  add(
    book,
    "Provider listings",
    [
      "Listing ID",
      "Title",
      "Category",
      "Status",
      "Listed price",
      "Currency",
      "Price period",
      "Summary",
      "Description",
      "Demo",
    ],
    data.marketplaceListings.map((l) => [
      id(l),
      l.title,
      l.category,
      l.status,
      l.priceMinor / 100,
      l.currency,
      l.billing,
      l.summary,
      l.description,
      l.isDemo,
    ]),
  );
  add(
    book,
    "Saved listings",
    ["Listing ID", "Saved at"],
    data.savedListings.map((s) => [id(s.listingId), s.createdAt]),
  );
  add(
    book,
    "Templates",
    [
      "Template ID",
      "Title",
      "Exercise",
      "Sets",
      "Reps",
      "Weight (kg)",
      "Rest (sec)",
      "Notes",
    ],
    data.templates.flatMap((t) =>
      t.items.map((i) => [
        id(t),
        t.title,
        name(i.exerciseId),
        i.sets,
        i.reps,
        i.targetWeightKg,
        i.restSec,
        i.notes,
      ]),
    ),
  );
  add(
    book,
    "Coaching",
    ["Relationship ID", "Coach ID", "Athlete ID", "Status", "Started at"],
    data.coaching.map((c) => [
      id(c),
      id(c.coachId),
      id(c.athleteId),
      c.status,
      c.startedAt,
    ]),
  );
  add(
    book,
    "Memberships",
    ["Membership ID", "Gym ID", "Role", "Status", "Created at"],
    data.memberships.map((m) => [
      id(m),
      id(m.gymId),
      m.role,
      m.status,
      m.createdAt,
    ]),
  );
  add(
    book,
    "Authored comments",
    ["Comment ID", "Workout ID", "Log ID", "Date", "Comment"],
    data.comments.map((c) => [
      id(c),
      id(c.workoutId),
      id(c.workoutLogId),
      c.createdAt,
      c.text,
    ]),
  );
  add(
    book,
    "Photo metadata",
    ["Photo ID", "Date", "MIME type", "Caption"],
    data.photos.map((p) => [id(p), p.createdAt, p.mimeType, p.caption]),
  );
  return book;
}
