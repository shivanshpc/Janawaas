
const xlsx = require('xlsx');
const path = require('path');

function analyzeExcel() {
    try {
        const filePath = 'Municipal_Authorities_India.xlsx';
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to array of arrays to see headers clearly
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        console.log('Headers (First 5 Rows):');
        console.log(JSON.stringify(data.slice(0, 5), null, 2));
        
        const delhiRows = data.filter(row => 
            row.some(cell => typeof cell === 'string' && (cell.includes('Delhi') || cell.includes('NCT')))
        );
        
        console.log('\nTotal Delhi-related Rows:', delhiRows.length);
        if (delhiRows.length > 0) {
            console.log('First Delhi Row:', JSON.stringify(delhiRows[0], null, 2));
        }
        
    } catch (error) {
        console.error('Analysis error:', error);
    }
}

analyzeExcel();
