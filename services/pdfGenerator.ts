import React from 'react';
import ReactDOM from 'react-dom/client';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PdfTemplate } from '../components/pdf/PdfTemplate';
import { FavoritesPdfTemplate } from '../components/pdf/FavoritesPdfTemplate';
import { LenderCheatSheetTemplate } from '../components/pdf/LenderCheatSheetTemplate';
import type { DealPdfData, LenderProfile, Settings } from '../types';

const renderComponentAsPdfBlob = async (component: React.ReactElement, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<Blob> => {
    // Create a container element that will be placed off-screen.
    // This is the most reliable way to ensure the browser renders the content fully.
    const container = document.createElement('div');
    
    // Style the container
    container.style.position = 'absolute';
    container.style.top = '-9999px'; // Move it far off the top of the screen
    container.style.left = '-9999px'; // Move it far off the left of the screen
    container.style.background = 'white'; // Ensure a solid background
    // Give it a defined size to help the layout engine
    container.style.width = orientation === 'landscape' ? '297mm' : '210mm';
    container.style.height = orientation === 'landscape' ? '210mm' : '297mm';

    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);

    try {
        // Render the component and wait for the next paint cycle to ensure it's in the DOM.
        await new Promise<void>(resolve => {
            root.render(component);
            // Using requestAnimationFrame is more reliable than a fixed timeout
            requestAnimationFrame(() => resolve());
        });
        
        // A small extra delay can help with complex layouts or web fonts.
        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(container, {
            scale: 2, // Higher scale for better quality
            useCORS: true,
            backgroundColor: '#ffffff', // Explicitly tell html2canvas to use a white background
            logging: false, // Disable console logging from html2canvas
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation,
            unit: 'mm',
            format: 'a4',
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);
        const imgAspectRatio = imgProps.width / imgProps.height;
        const pdfAspectRatio = pdfWidth / pdfHeight;

        let finalWidth, finalHeight;

        // Fit image within the page boundaries while maintaining aspect ratio
        if (imgAspectRatio > pdfAspectRatio) {
            finalWidth = pdfWidth;
            finalHeight = pdfWidth / imgAspectRatio;
        } else {
            finalHeight = pdfHeight;
            finalWidth = pdfHeight * imgAspectRatio;
        }

        const x = (pdfWidth - finalWidth) / 2;
        const y = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        return pdf.output('blob');

    } catch (error) {
        console.error("PDF Generation Error:", error);
        throw new Error("Failed to create the PDF. Please check the console for details.");
    } finally {
        // CRITICAL: Always clean up the DOM element and unmount the React component.
        root.unmount();
        document.body.removeChild(container);
    }
};


export const generateDealPdf = async (data: DealPdfData, settings: Settings): Promise<Blob> => {
    const props = { ...data, settings };
    return renderComponentAsPdfBlob(React.createElement(PdfTemplate, props), 'portrait');
};

export const generateFavoritesPdf = async (data: DealPdfData[], settings: Settings): Promise<Blob> => {
    const props = { deals: data, settings };
    return renderComponentAsPdfBlob(React.createElement(FavoritesPdfTemplate, props), 'portrait');
};

export const generateLenderCheatSheetPdf = async (profiles: LenderProfile[]): Promise<Blob> => {
    const props = { profiles };
    return renderComponentAsPdfBlob(React.createElement(LenderCheatSheetTemplate, props), 'landscape');
};
