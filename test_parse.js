const fullText = `Statement for A/c XXXXXXXX2808 for the period 26-Jun-2025 to 25-Jun-2026 
Customer Id XXXXXXX36 
Name ATTALURI VENKATA NAG 
Phone +917305065761 
Address RC BLOSSOM 29 FLAT A2 
BLOCK E PERUMBAKKA CHENNAI CHENNAI 
TAMIL NADU 
Branch Code 3393 
Branch Name MEDAVAKKAM 
IFSC Code CNRB0003393 
Address #4/329, PERUMBAKKAM MAIN 
ROAD, OPP.ARUN HOSPITAL, MEDAVAKKAM 
TAMIL NADU 
Date Particulars Deposits Withdrawals Balance 
Opening Balance 1,526.00 
28-06-2025 
SBINT FOR THE PERIOD 
FROM28-MAR-25 TO 27-JUN-25 
Chq: 
11.00 1,537.00 
28-09-2025 
SBINT FOR THE PERIOD 
FROM28-JUN-25 TO 27-SEP-25 
Chq: 
10.00 1,547.00 
27-12-2025 
SBINT FOR THE PERIOD 
FROM28-SEP-25 TO 27-DEC-25 
Chq: 
10.00 1,557.00 
10-03-2026 
UPI/DR/119821330392/SHAKTHI 
X/UTIB/**06653@OKBIZAXIS/U 
PI//HDF83B275F6334E44C6A62 
26AAA3B99201D/10/03/2026 
20:53:22 
Chq: 119821330392 
101.00 1,456.00 
11-03-2026 
UPI/DR/119837497917/GEETHA 
C/YESB/**VYZJ5@PAYTM/UPI// 
HDFFD522FF5F06640BDAABBB 
C8401809C15/11/03/2026 
10:18:21 
Chq: 119837497917 
37.00 1,419.00 
page 1 

--- PAGE BREAK ---

Date Particulars Deposits Withdrawals Balance 
12-03-2026 
UPI/DR/119911954710/GEETHA 
C/YESB/**VYZJ5@PAYTM/UPI// 
HDF4AB7F06348574C2DA25B7 
8786D35EA12/12/03/2026 
17:55:39 
Chq: 119911954710 
40.00 1,379.00 
12-03-2026 
UPI/DR/119911983381/LIYAN 
AHA/SBIN/**YAN20@OKSBI/UPI 
//HDF68A2756C9B32454D91525 
8AFAA953E52/12/03/2026 
17:56:10 
Chq: 119911983381 
20.00 1,359.00`;

let currentTx = null;
const parsedTxs = [];
const lines = fullText.split('\n');

const finalizeTx = (tx) => {
    tx.narration = tx.narration.trim();
    let type = 'expense';
    if (tx.narration.includes('/CR/') || tx.narration.includes('SBINT') || tx.narration.includes('CREDIT') || tx.narration.includes('DEPOSIT')) {
        type = 'income';
    }
    const dParts = tx.dateStr.split('-');
    if (dParts.length === 3) {
        const isoDate = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
        parsedTxs.push({ date: isoDate, title: tx.narration.substring(0, 80), amount: tx.amount, type: type, paymentMethod: 'UPI' });
    }
};

for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.includes('PAGE BREAK') || line.includes('Closing Balance')) continue;

    if (/^\d{2}-\d{2}-\d{4}$/.test(line)) {
        if (currentTx && currentTx.amount > 0) finalizeTx(currentTx);
        currentTx = { dateStr: line, narration: "", amount: 0 };
        continue;
    }

    if (currentTx) {
        if (line.startsWith('Chq:')) {
            continue;
        } else if (/^[\d,]+\.\d{2}\s+[\d,]+\.\d{2}$/.test(line)) {
            const parts = line.split(/\s+/);
            currentTx.amount = parseFloat(parts[0].replace(/,/g, ''));
        } else {
            currentTx.narration += line + " ";
        }
    }
}
if (currentTx && currentTx.amount > 0) finalizeTx(currentTx);

console.log(JSON.stringify(parsedTxs, null, 2));
