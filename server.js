// Node.js server acting as the API layer between frontend and MS SQL Server

const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const PORT = 3000;

// -------------------------
// DATABASE CONFIGURATION
// -------------------------
const dbConfig = {
    user: 'sa',                // Your SQL Server username
    password: 'root',          // Your SQL Server password
    server: 'OMIRA\\SQLEXPRESS',        // Use localhost for local SQL Server
    database: 'UMS_System',  // Your database name
    
    options: {
        enableArithAbort: true,
        trustServerCertificate: false,
        instanceName: 'SQLEXPRESS', // Leave empty for default instance
        encrypt: false  // Set to true if using Azure
    },

   
};

// -------------------------
// MIDDLEWARE
// -------------------------
app.use(cors());           // Allow frontend to communicate
app.use(express.json());   // Parse JSON payloads

// -------------------------
// DATABASE CONNECTION POOL
// -------------------------
let pool;

async function connectDb() {
    try {
        if (!pool) {
            pool = await sql.connect(dbConfig);
            console.log('✅ Database connection established successfully.');
        }
        return pool;
    } catch (err) {
        console.error('❌ Database Connection Failed! Details:', err.message);
        console.error('Check dbConfig: user, password, server, port.');
        throw err;
    }
}

// Attempt initial connection
connectDb();

// -------------------------
// 1. LOGIN ENDPOINT
// -------------------------
app.post('/login', async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'Missing username, password, or role.' });
    }

    try {
        const pool = await connectDb();
        const request = pool.request();


        request.input('username', sql.NVarChar, username);
        request.input('password', sql.NVarChar, password);
        request.input('role', sql.NVarChar, role);

        const result = await request.query(`
            SELECT UserID, FullName, Role 
            FROM [dbo].[User_Staff] 
            WHERE Username = @username 
              AND PasswordHash = @password 
              AND Role = @role
        `);

        if (result.recordset.length > 0) {
            res.json({ success: true, user: result.recordset[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials or role.' });
        }

    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// -------------------------
// 2. GET CUSTOMERS
// -------------------------
app.get('/getCustomers', async (req, res) => {
    try {
        const pool = await connectDb();
        const result = await pool.request().query('SELECT * FROM [dbo].[Customer]');
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Get Customers Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve customers.' });
    }
});

// -------------------------
// 3. ADD CUSTOMER
// -------------------------
app.post('/addCustomer', async (req, res) => {
    const { 
        'customer-name': customerName, 
        'customer-type': customerType, 
        email, 
        phone, 
        'service-address': serviceAddress, 
        'billing-address': billingAddress 
    } = req.body;

    const customerId = 'CUST-' + Math.floor(Math.random() * 900 + 100);

    try {
        const pool = await connectDb();
        const request = pool.request();

        const query = `
            INSERT INTO [dbo].[Customer] 
                (CustomerID, CustomerName, CustomerType, Email, Phone, ServiceAddress, BillingAddress, RegistrationDate)
            VALUES 
                (@customerId, @customerName, @customerType, @email, @phone, @serviceAddress, @billingAddress, GETDATE())
        `;

        request.input('customerId', sql.NVarChar, customerId);
        request.input('customerName', sql.NVarChar, customerName);
        request.input('customerType', sql.NVarChar, customerType);
        request.input('email', sql.NVarChar, email);
        request.input('phone', sql.NVarChar, phone);
        request.input('serviceAddress', sql.NVarChar, serviceAddress);
        request.input('billingAddress', sql.NVarChar, billingAddress);

        await request.query(query);
        res.json({ success: true, message: 'Customer added.', customerId });

    } catch (err) {
        console.error('Add Customer Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add customer.' });
    }
});

// -------------------------
// 4. GET METERS
// -------------------------
app.get('/getMeters', async (req, res) => {
    try {
        const pool = await connectDb();
        const query = `
            SELECT M.MeterID, M.CustomerID, U.UtilityName, M.Status, C.ServiceAddress, M.Location
            FROM [dbo].[Meter] AS M
            JOIN [dbo].[Customer] AS C ON M.CustomerID = C.CustomerID
            JOIN [dbo].[Utility_Type] AS U ON M.UtilityID = U.UtilityID
        `;
        const result = await pool.request().query(query);
        res.json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('Get Meters Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve meters.' });
    }
});

// -------------------------
// 5. ADD METER
// -------------------------
app.post('/addMeter', async (req, res) => {
    const { 
        'customer-id': customerId, 
        'meter-id': meterId, 
        'utility-type': utilityId, 
        status, 
        location 
    } = req.body;

    if (!customerId || !meterId || !utilityId || !status) {
        return res.status(400).json({ success: false, message: 'Missing meter details.' });
    }

    try {
        const pool = await connectDb();
        const request = pool.request();
        const query = `
            INSERT INTO [dbo].[Meter] 
                (MeterID, CustomerID, UtilityID, Status, Location, InstallDate)
            VALUES 
                (@meterId, @customerId, @utilityId, @status, @location, GETDATE())
        `;
        request.input('meterId', sql.NVarChar, meterId);
        request.input('customerId', sql.NVarChar, customerId);
        request.input('utilityId', sql.NVarChar, utilityId);
        request.input('status', sql.NVarChar, status);
        request.input('location', sql.NVarChar, location);

        await request.query(query);
        res.json({ success: true, message: 'Meter added successfully.' });
    } catch (err) {
        console.error('Add Meter Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to add meter.' });
    }
});

// -------------------------
// 6. RECORD PAYMENT
// -------------------------
app.post('/recordPayment', async (req, res) => {
    const { 'bill-id': billId, 'payment-amount': paymentAmount, 'payment-method': paymentMethod } = req.body;
    const cashierId = 'U-003'; // Example cashier ID

    try {
        const pool = await connectDb();
        const request = pool.request();
        await request
            .input('BillID', sql.NVarChar, billId)
            .input('UserID', sql.NVarChar, cashierId)
            .input('PaymentAmount', sql.Decimal(10,2), paymentAmount)
            .input('PaymentMethod', sql.NVarChar, paymentMethod)
            .execute('[dbo].[sp_RecordPayment]');
        res.json({ success: true, message: 'Payment recorded.' });
    } catch (err) {
        console.error('Record Payment Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to record payment.' });
    }
});


//Added by me

//First edit omira

// -------------------------
// 7. GET DEFAULTERS (FINAL)
// (For the Manager's Report)
// -------------------------
app.get('/api/defaulters', async (req, res) => {
    
    // This query is now updated to match your database schema
    const query = `
        SELECT 
            C.CustomerID,
            C.CustomerName,
            C.Phone,
            C.CustomerType,
            COUNT(B.BillID) AS UnpaidBills,
            SUM(B.AmountDue) AS TotalDue
        FROM 
            [dbo].[Customer] AS C
        JOIN 
            [dbo].[Bill] AS B ON C.CustomerID = B.CustomerID
        WHERE 
            B.Status = 'Unpaid' OR B.Status = 'Overdue' -- Matches your Bill table
        GROUP BY 
            C.CustomerID, C.CustomerName, C.Phone, C.CustomerType
        HAVING
            COUNT(B.BillID) > 0  -- Only show customers with at least one unpaid bill
        ORDER BY 
            TotalDue DESC;
    `;

    try {
        const pool = await connectDb();
        const result = await pool.request().query(query);
        
        // Send the data back in the correct format
        res.json({ success: true, data: result.recordset });

    } catch (err) {
        console.error('Get Defaulters Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve defaulters.' });
    }
});


//--------omira 1st edit ------//


//-2nd Edit omira  

// 8. GET CONSUMPTION DATA (FOR USAGE PATTERNS)
//    *** THIS IS THE NEW ENDPOINT ***
// ----------------------------------------------------
app.get('/api/consumption-data', async (req, res) => {
    
    // This query sums the 'Consumption' column from the 'Bill' table
    // for all bills issued in the last 30 days.
    
    const query = `
        WITH ConsumptionData AS (
            SELECT 
                C.CustomerID,
                C.CustomerName,
                U.UtilityName,
                U.Unit,
                SUM(B.Consumption) AS TotalConsumption
            FROM 
                [dbo].[Bill] AS B
            JOIN 
                [dbo].[Customer] AS C ON B.CustomerID = C.CustomerID
            JOIN 
                [dbo].[Meter] AS M ON B.MeterID = M.MeterID
            JOIN 
                [dbo].[Utility_Type] AS U ON M.UtilityID = U.UtilityID
            WHERE
                -- Finds all bills issued in the last 30 days
                B.BillDate BETWEEN DATEADD(day, -30, GETDATE()) AND GETDATE()
            GROUP BY
                C.CustomerID, C.CustomerName, U.UtilityName, U.Unit
        )
        SELECT 
            RANK() OVER (ORDER BY TotalConsumption DESC) AS Rank,
            CustomerID,
            CustomerName,
            UtilityName AS Utility,
            -- Formats the number (e.g., 5000 -> '5,000') and adds the unit
            FORMAT(TotalConsumption, 'N0') + ' ' + Unit AS Consumption
        FROM 
            ConsumptionData
        WHERE
            TotalConsumption > 0 -- Only show customers who consumed something
        ORDER BY 
            Rank;
    `;

    try {
        const pool = await connectDb();
        const result = await pool.request().query(query);
        
        res.json({ success: true, data: result.recordset });

    } catch (err) {
        console.error('Get Consumption Data Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve consumption data.' });
    }
});

//--------omira


// omira 3rd edit

//revenue trends

// Add this new endpoint to your server.js file

// -------------------------
// 9. GET REVENUE TRENDS (FOR REVENUE TRENDS PAGE)
// -------------------------
app.get('/api/revenue-trends', async (req, res) => {
    
    // This query calculates revenue from the Payment table,
    // groups it by month, and PIVOTs it by utility type.
    const query = `
        WITH MonthlyData AS (
            SELECT 
                U.UtilityName,
                SUM(P.PaymentAmount) AS Revenue,
                -- Get a key to sort the months correctly
                EOMONTH(P.PaymentDate) AS MonthSortKey,
                -- Get the display name (e.g., 'November 2025')
                FORMAT(P.PaymentDate, 'MMMM yyyy') AS PaymentMonth
            FROM 
                [dbo].[Payment] AS P
            JOIN 
                [dbo].[Bill] AS B ON P.BillID = B.BillID
            JOIN 
                [dbo].[Meter] AS M ON B.MeterID = M.MeterID
            JOIN 
                [dbo].[Utility_Type] AS U ON M.UtilityID = U.UtilityID
            WHERE 
                -- Get payments from the start of the month, 6 months ago
                P.PaymentDate >= DATEADD(month, -6, DATEADD(day, 1, EOMONTH(GETDATE(), -1)))
            GROUP BY 
                U.UtilityName, FORMAT(P.PaymentDate, 'MMMM yyyy'), EOMONTH(P.PaymentDate)
        )
        -- Final query to pivot the data and send raw numbers
        SELECT 
            PaymentMonth AS Month,
            ISNULL([Electricity], 0) AS Electricity,
            ISNULL([Water], 0) AS Water,
            ISNULL([Gas], 0) AS Gas,
            (ISNULL([Electricity], 0) + ISNULL([Water], 0) + ISNULL([Gas], 0)) AS TotalRevenue
        FROM 
            MonthlyData
        PIVOT (
            SUM(Revenue)
            FOR UtilityName IN ([Electricity], [Water], [Gas])
        ) AS PivotTable
        -- Order by the date key, not the month name (so 'June' comes after 'May')
        ORDER BY 
            MonthSortKey;
    `;

    try {
        const pool = await connectDb();
        const result = await pool.request().query(query);
        
        res.json({ success: true, data: result.recordset });

    } catch (err) {
        console.error('Get Revenue Trends Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve revenue data.' });
    }
});


//end code for omira


//omira 4th edit

// ====================================================
// START: CORRECTED DYNAMIC REPORTS ENDPOINT
// ====================================================

// ----------------------------------------------------
// 10. DYNAMIC REPORTS ENDPOINT (FOR MANAGER DASHBOARD)
// ----------------------------------------------------
app.get('/api/reports', async (req, res) => {
    const { type, start, end } = req.query;

    if (!type || !start || !end) {
        return res.status(400).json({ success: false, message: 'Missing report type, start date, or end date.' });
    }

    let query = '';
    let responseData = { success: true, data: [], total: 0 };

    try {
        const pool = await connectDb();
        const request = pool.request();
        
        // Use NVarChar for dates, it's safer for SQL Server
        request.input('startDate', sql.NVarChar, start);
        request.input('endDate', sql.NVarChar, end);

        if (type === 'revenue') {
            // --- Query for Revenue Collections ---
            query = `
                SELECT 
                    FORMAT(P.PaymentDate, 'yyyy-MM-dd') AS Date,
                    U.UtilityName AS Utility,
                    COUNT(P.PaymentID) AS PaymentsReceived,
                    SUM(P.PaymentAmount) AS Total
                FROM 
                    [dbo].[Payment] AS P
                JOIN 
                    [dbo].[Bill] AS B ON P.BillID = B.BillID
                JOIN 
                    [dbo].[Meter] AS M ON B.MeterID = M.MeterID
                JOIN 
                    [dbo].[Utility_Type] AS U ON M.UtilityID = U.UtilityID
                WHERE 
                    P.PaymentDate BETWEEN @startDate AND @endDate
                GROUP BY 
                    FORMAT(P.PaymentDate, 'yyyy-MM-dd'), U.UtilityName
                ORDER BY 
                    Date, Utility;
            `;
            
            const dataResult = await request.query(query);
            responseData.data = dataResult.recordset;

            // --- Query for the Grand Total ---
            const totalQuery = `
                SELECT SUM(PaymentAmount) AS GrandTotal 
                FROM [dbo].[Payment] 
                WHERE PaymentDate BETWEEN @startDate AND @endDate;
            `;
            
            // Create a new request object for the total query
            const totalResult = await pool.request()
                                      .input('startDate', sql.NVarChar, start)
                                      .input('endDate', sql.NVarChar, end)
                                      .query(totalQuery);
                                      
            if (totalResult.recordset.length > 0) {
                responseData.total = totalResult.recordset[0].GrandTotal;
            }

        } else if (type === 'defaulters') {
            // --- Query for Defaulters ---
            query = `
                SELECT 
                    C.CustomerID,
                    C.CustomerName,
                    C.Phone,
                    C.CustomerType,
                    COUNT(B.BillID) AS UnpaidBills,
                    SUM(B.AmountDue) AS TotalDue
                FROM 
                    [dbo].[Customer] AS C
                JOIN 
                    [dbo].[Bill] AS B ON C.CustomerID = B.CustomerID
                WHERE 
                    (B.Status = 'Unpaid' OR B.Status = 'Overdue')
                    AND B.BillDate BETWEEN @startDate AND @endDate
                GROUP BY 
                    C.CustomerID, C.CustomerName, C.Phone, C.CustomerType
                HAVING
                    COUNT(B.BillID) > 0
                ORDER BY 
                    TotalDue DESC;
            `;
            const dataResult = await request.query(query);
            responseData.data = dataResult.recordset;
            
            // Calculate total due from the results
            responseData.total = dataResult.recordset.reduce((acc, row) => acc + row.TotalDue, 0);

        } else if (type === 'usage') {
            // --- Query for Top Consumers / Usage Patterns ---
            query = `
                WITH ConsumptionData AS (
                    SELECT 
                        C.CustomerID,
                        C.CustomerName,
                        U.UtilityName,
                        U.Unit,
                        SUM(B.Consumption) AS TotalConsumption
                    FROM 
                        [dbo].[Bill] AS B
                    JOIN 
                        [dbo].[Customer] AS C ON B.CustomerID = C.CustomerID
                    JOIN 
                        [dbo].[Meter] AS M ON B.MeterID = M.MeterID
                    JOIN 
                        [dbo].[Utility_Type] AS U ON M.UtilityID = U.UtilityID
                    WHERE
                        B.BillDate BETWEEN @startDate AND @endDate
                    GROUP BY
                        C.CustomerID, C.CustomerName, U.UtilityName, U.Unit
                )
                SELECT 
                    RANK() OVER (ORDER BY TotalConsumption DESC) AS Rank,
                    CustomerID,
                    CustomerName,
                    UtilityName AS Utility,
                    FORMAT(TotalConsumption, 'N0') + ' ' + Unit AS Consumption
                FROM 
                    ConsumptionData
                WHERE
                    TotalConsumption > 0
                ORDER BY 
                    Rank;
            `;
            const dataResult = await request.query(query);
            responseData.data = dataResult.recordset;
            // No total for this report type
        }

        res.json(responseData);

    } catch (err) {
        console.error(`Get Reports Error (Type: ${type}):`, err.message);
        res.status(500).json({ success: false, message: 'Failed to retrieve report data.' });
    }
});

// ====================================================
// END: CORRECTED ENDPOINT
// ====================================================




// -------------------------
// . SERVER LISTENER
// -------------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
