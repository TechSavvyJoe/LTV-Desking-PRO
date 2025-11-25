
import type { Vehicle } from '../types';

declare const XLSX: any; // Assuming XLSX is available from CDN script

const splitCsvIntoRows = (csvString: string): string[] => {
    if (csvString === undefined || csvString === null) return [];
    if (typeof csvString !== 'string') return [];
    const str = String(csvString);
    if (str.length === 0) return [];
    
    const rows = [];
    let currentRowStart = 0;
    let inQuotes = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') {
            if (inQuotes && i + 1 < str.length && str[i + 1] === '"') {
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            rows.push(str.substring(currentRowStart, i).trim());
            if (char === '\r' && i + 1 < str.length && str[i + 1] === '\n') {
                i++;
            }
            currentRowStart = i + 1;
        }
    }
    if (currentRowStart < str.length) {
        rows.push(str.substring(currentRowStart).trim());
    }
    return rows.filter(row => row);
};

const parseCsvRow = (rowString: string, delimiter: string): string[] => {
    if (!rowString) return [];
    const res = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < rowString.length; i++) {
        const char = rowString[i];
        if (char === '"') {
            if (inQ && i + 1 < rowString.length && rowString[i + 1] === '"') {
                cell += '"';
                i++;
            } else {
                inQ = !inQ;
            }
        } else if (char === delimiter && !inQ) {
            res.push(cell.trim());
            cell = '';
        } else {
            cell += char;
        }
    }
    res.push(cell.trim());
    return res;
};

const detectDelimiter = (headerLine: string): string => {
    if (!headerLine || typeof headerLine !== 'string') return ',';
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    return (semicolonCount > 0 && (commaCount === 0 || semicolonCount > commaCount * 2)) ? ';' : ',';
};

const parseNumber = (str: string | undefined): number | 'N/A' => {
  if (str === undefined || str === null || String(str).trim() === '') return 'N/A';
  const cleaned = String(str).replace(/[^0-9.-]+/g, "");
  // Prevent multiple dots/dashes that would yield NaN.
  const isLikelyNumber = /^-?\d+(\.\d+)?$/.test(cleaned);
  if (!isLikelyNumber) return 'N/A';
  const num = parseFloat(cleaned);
  return isNaN(num) ? 'N/A' : num;
};

export const parseFile = (file: File): Promise<Vehicle[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                let csvContent: string;
                const isExcel = file.name.endsWith('.xls') || file.name.endsWith('.xlsx');

                if (isExcel) {
                    if (typeof XLSX === 'undefined') {
                        throw new Error("Excel parsing is unavailable. Please ensure the XLSX library is loaded or upload a CSV instead.");
                    }
                    const workbook = XLSX.read(data, { type: 'array', cellNF: false, cellText: true });
                    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                        throw new Error("The uploaded Excel file contains no sheets.");
                    }
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    csvContent = XLSX.utils.sheet_to_csv(worksheet, { forceQuotes: true });
                } else {
                    csvContent = new TextDecoder('utf-8').decode(new Uint8Array(data as ArrayBuffer));
                }

                if (!csvContent || typeof csvContent !== 'string' || csvContent.trim() === "") {
                    throw new Error("File content is empty or the first sheet is blank.");
                }

                const lines = splitCsvIntoRows(csvContent);
                if (lines.length < 2) {
                    throw new Error("File has a header row but no data.");
                }

                const headerLine = lines[0];
                const delimiter = isExcel ? ',' : detectDelimiter(headerLine);
                const headers = parseCsvRow(headerLine, delimiter).map(h => h.trim());

                const idx = {
                    vehicle: headers.indexOf("Vehicle"),
                    stock: headers.indexOf("Stock #"),
                    vin: headers.indexOf("VIN"),
                    price: headers.indexOf("Price"),
                    jdPower: headers.findIndex(h => h.includes("J.D. Power") && h.includes("Trade In")),
                    jdPowerRetail: headers.findIndex(h => h.includes("J.D. Power") && h.includes("Retail")),
                    unitCost: headers.indexOf("Unit Cost"),
                    modelYear: headers.indexOf("Model Year"),
                    mileage: headers.findIndex(h => h.toLowerCase() === "odometer" || h.toLowerCase() === "mileage")
                };

                const requiredColumnsMap = {
                    vehicle: "'Vehicle'",
                    stock: "'Stock #'",
                    vin: "'VIN'",
                    price: "'Price'",
                    jdPower: "'J.D. Power Trade In'",
                    mileage: "'Odometer' or 'Mileage'"
                };

                const missingColumns = Object.entries(requiredColumnsMap)
                    .filter(([key]) => idx[key as keyof typeof idx] === -1)
                    .map(([, friendlyName]) => friendlyName);

                if (missingColumns.length > 0) {
                    const missingMessage = `File is missing or has misnamed required columns: ${missingColumns.join(', ')}.`;
                    const foundMessage = `The headers found in the file are: [${headers.join(', ')}].`;
                    const suggestion = `Please correct the column headers and try again.`;
                    throw new Error(`${missingMessage}\n${foundMessage}\n${suggestion}`);
                }
                
                const vehicles: Vehicle[] = lines.slice(1).map((rowString): Vehicle | null => {
                    if (!rowString) return null;
                    const vals = parseCsvRow(rowString, delimiter);
                    if (vals.length < headers.length) return null;

                    const vehicleDescription = vals[idx.vehicle] || "";
                    let modelYear = parseNumber(vals[idx.modelYear]);
                    if (modelYear === 'N/A') {
                      const yearMatch = vehicleDescription.match(/\b(19[89]\d|20\d{2})\b/);
                      if (yearMatch) modelYear = parseInt(yearMatch[0], 10);
                    }
                    
                    return {
                        vehicle: vehicleDescription,
                        stock: vals[idx.stock] || 'N/A',
                        vin: vals[idx.vin] || 'N/A',
                        modelYear: modelYear,
                        mileage: parseNumber(vals[idx.mileage]),
                        price: parseNumber(vals[idx.price]),
                        jdPower: parseNumber(vals[idx.jdPower]),
                        jdPowerRetail: idx.jdPowerRetail !== -1 ? parseNumber(vals[idx.jdPowerRetail]) : 'N/A',
                        unitCost: idx.unitCost !== -1 ? parseNumber(vals[idx.unitCost]) : 'N/A',
                        baseOutTheDoorPrice: 'N/A', // will be calculated later
                    };
                }).filter((v): v is Vehicle => v !== null);

                resolve(vehicles);

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => {
            reject(new Error("Error reading the file."));
        };

        reader.readAsArrayBuffer(file);
    });
};
