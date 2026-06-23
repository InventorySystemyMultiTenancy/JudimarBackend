CREATE TABLE "MonthlyBalance" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "grossRevenue" DECIMAL(12,2) NOT NULL,
    "cardFees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryFees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(12,2) NOT NULL,
    "initialInventory" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "purchases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalInventory" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cmv" DECIMAL(12,2) NOT NULL,
    "fixedExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "variableExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payrollExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marketingExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "otherExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(12,2) NOT NULL,
    "netProfit" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyBalance_month_year_key"
ON "MonthlyBalance"("month", "year");
