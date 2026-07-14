// ====================================================================
// تطبيق معالجة وتحويل ملفات PDF المتكامل (Client-side) - كود محدث بالكامل
// ====================================================================

// الانتظار حتى تحميل مستند الصفحة بالكامل
document.addEventListener("DOMContentLoaded", () => {
    initRouter();
    initAppComponents();
});

// ---------------------------------------------------------
// 1. نظام التوجيه وإدارة الصفحات (Router)
// ---------------------------------------------------------
function initRouter() {
    const navLinks = document.querySelectorAll("[data-target]");
    const sections = document.querySelectorAll(".app-section");

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetId = link.getAttribute("data-target");
            
            // تنشيط القسم المطلوب وإخفاء الباقي
            sections.forEach(section => {
                if (section.id === targetId) {
                    section.classList.add("active");
                    section.classList.remove("hidden");
                } else {
                    section.classList.remove("active");
                    section.classList.add("hidden");
                }
            });

            // تحديث حالة الأزرار النشطة في القائمة
            navLinks.forEach(l => l.classList.remove("nav-active"));
            link.classList.add("nav-active");
        });
    });
}

// ---------------------------------------------------------
// 2. إدارة المكونات والأحداث العامة
// ---------------------------------------------------------
function initAppComponents() {
    // مستمعي الأحداث لأدوات تحويل الملفات
    const wordInput = document.getElementById("word-file-input");
    const wordBtn = document.getElementById("word-convert-btn");
    if (wordBtn && wordInput) {
        wordBtn.addEventListener("click", async () => {
            const file = wordInput.files[0];
            if (!file) {
                showNotification("يرجى اختيار ملف Word أولاً!", "warning");
                return;
            }
            await convertWordToPdf(file);
        });
    }

    const pdfToWordInput = document.getElementById("pdf-to-word-input");
    const pdfToWordBtn = document.getElementById("pdf-to-word-btn");
    if (pdfToWordBtn && pdfToWordInput) {
        pdfToWordBtn.addEventListener("click", async () => {
            const file = pdfToWordInput.files[0];
            if (!file) {
                showNotification("يرجى اختيار ملف PDF أولاً!", "warning");
                return;
            }
            await convertPdfToWord(file);
        });
    }

    // إعدادات السحب والإفلات (Drag & Drop) للملفات
    setupDragAndDrop();
}

// ---------------------------------------------------------
// * الحل الجذري: دالة تحويل Word إلى PDF (بدون ملفات فارغة)
// ---------------------------------------------------------
async function convertWordToPdf(file) {
    showLoading(true, "جاري معالجة وتحويل ملف Word... قد يستغرق ذلك بضع ثوانٍ.");
    try {
        // 1. تحميل المكتبات المطلوبة ديناميكياً من الـ CDN إذا لم تكن محملة سابقاً
        if (typeof mammoth === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
        }
        if (typeof html2pdf === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }

        // 2. قراءة ملف Word كمصفوفة بايتات (ArrayBuffer)
        const arrayBuffer = await readFileAsArrayBuffer(file);

        // 3. استخراج الـ HTML من ملف الـ Word باستخدام Mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const htmlContent = result.value;

        if (!htmlContent || htmlContent.trim() === "") {
            throw new Error("ملف Word فارغ أو غير مدعوم الصياغة.");
        }

        // 4. إنشاء حاوية مؤقتة مخفية في الـ DOM لتنسيق المحتوى قبل تصديره
        const tempContainer = document.createElement('div');
        tempContainer.id = "temp-pdf-render-area";
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = '800px'; 
        tempContainer.style.padding = '40px';
        tempContainer.style.background = '#ffffff';
        tempContainer.style.color = '#000000';
        tempContainer.style.fontFamily = 'Arial, sans-serif';
        tempContainer.style.lineHeight = '1.6';
        
        // دعم اتجاه النص للغة العربية والإنجليزية تلقائياً
        tempContainer.style.direction = 'auto'; 
        tempContainer.innerHTML = htmlContent;
        document.body.appendChild(tempContainer);

        // 5. إعداد خيارات مكتبة html2pdf لتوليد ملف عالي الجودة
        const opt = {
            margin:       15,
            filename:     file.name.replace(/\.[^/.]+$/, "") + ".pdf",
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // 6. تشغيل المعالجة غير المتزامنة لإنشاء الـ PDF وتنزيله مباشرة
        await html2pdf().from(tempContainer).set(opt).save();

        // 7. تنظيف الـ DOM بحذف الحاوية المؤقتة
        document.body.removeChild(tempContainer);
        showNotification("تم تحويل المستند وتنزيله بنجاح!", "success");

    } catch (error) {
        console.error("خطأ أثناء تحويل Word إلى PDF:", error);
        showNotification("فشل التحويل: " + error.message, "danger");
    } finally {
        showLoading(false);
    }
}

// ---------------------------------------------------------
// 3. دالة تحويل PDF إلى Word (استخراج النصوص)
// ---------------------------------------------------------
async function convertPdfToWord(file) {
    showLoading(true, "جاري استخراج النصوص من ملف PDF لتصديرها بصيغة Word...");
    try {
        if (typeof pdfjsLib === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }

        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let extractedText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            extractedText += pageText + "\n\n";
        }

        if (!extractedText.trim()) {
            throw new Error("لم نتمكن من استخراج أي نصوص. قد يكون الملف عبارة عن صور ممسوحة ضوئياً (OCR مطلوب).");
        }

        // إنشاء وتنزيل ملف Word (صيغة DOC مبسطة تحتوي على النصوص المستخرجة)
        const blob = new Blob(['<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><title>Converted Document</title><style>body { font-family: Arial; direction: rtl; }</style></head><body>' + extractedText.replace(/\n/g, '<br>') + '</body></html>'], {
            type: 'application/msword'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.[^/.]+$/, "") + ".doc";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification("تم تحويل النصوص وتحميل ملف Word بنجاح!", "success");
    } catch (error) {
        console.error("خطأ أثناء تحويل PDF إلى Word:", error);
        showNotification("فشل تحويل الملف: " + error.message, "danger");
    } finally {
        showLoading(false);
    }
}

// ---------------------------------------------------------
// 4. الدوال المساعدة البرمجية (Utility Functions)
// ---------------------------------------------------------

// تحميل المكتبات الخارجية برمجياً (Dynamic Loader)
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`فشل تحميل المكتبة الخارجية: ${src}`));
        document.head.appendChild(script);
    });
}

// قراءة الملفات كـ ArrayBuffer لدعم قراءة الملفات الثنائية
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

// إعداد السحب والإفلات لواجهات المستخدم
function setupDragAndDrop() {
    const dropZones = document.querySelectorAll(".drop-zone");
    dropZones.forEach(zone => {
        const input = zone.querySelector("input[type='file']");
        
        zone.addEventListener("dragover", (e) => {
            e.preventDefault();
            zone.classList.add("drop-zone--over");
        });

        ["dragleave", "dragend"].forEach(type => {
            zone.addEventListener(type, () => {
                zone.classList.remove("drop-zone--over");
            });
        });

        zone.addEventListener("drop", (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                updateThumbnail(zone, e.dataTransfer.files[0]);
            }
            zone.classList.remove("drop-zone--over");
        });

        input.addEventListener("change", () => {
            if (input.files.length) {
                updateThumbnail(zone, input.files[0]);
            }
        });
    });
}

function updateThumbnail(dropZone, file) {
    let thumbnailElement = dropZone.querySelector(".drop-zone__thumb");
    const promptElement = dropZone.querySelector(".drop-zone__prompt");
    if (promptElement) promptElement.style.display = "none";

    if (!thumbnailElement) {
        thumbnailElement = document.createElement("div");
        thumbnailElement.classList.add("drop-zone__thumb");
        dropZone.appendChild(thumbnailElement);
    }
    thumbnailElement.dataset.label = file.name;
}

// واجهة شاشة تحميل مؤقتة أثناء معالجة البيانات الثقيلة
function showLoading(show, message = "جاري معالجة طلبك...") {
    let loader = document.getElementById("app-global-loader");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "app-global-loader";
        loader.innerHTML = `
            <div class="loader-content" style="text-align: center; color: white;">
                <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto 20px;"></div>
                <p id="loader-message" style="font-size: 1.1rem; font-weight: bold;"></p>
            </div>
        `;
        // تنسيقات الـ Loader لتغطية الشاشة بالكامل بشكل أنيق
        Object.assign(loader.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', justifyContent: 'center',
            alignItems: 'center', zIndex: '9999', transition: 'opacity 0.3s ease'
        });
        
        // إضافة أنيميشن الدوران للـ Spinner في الـ CSS
        const style = document.createElement('style');
        style.innerHTML = "@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
        document.head.appendChild(style);
        
        document.body.appendChild(loader);
    }

    const msgEl = loader.querySelector("#loader-message");
    if (msgEl) msgEl.innerText = message;
    loader.style.display = show ? "flex" : "none";
}

// عرض إشعارات للمستخدم عند النجاح أو الخطأ
function showNotification(message, type = "info") {
    let container = document.getElementById("notification-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "notification-container";
        Object.assign(container.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: '10000',
            display: 'flex', flexDirection: 'column', gap: '10px'
        });
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.innerText = message;
    Object.assign(toast.style, {
        padding: '12px 24px', borderRadius: '4px', color: '#fff', fontSize: '0.95rem',
        fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transition: 'all 0.3s ease',
        transform: 'translateY(50px)', opacity: '0', minWidth: '250px', textAlign: 'center'
    });

    // تحديد اللون بناءً على نوع التنبيه
    if (type === "success") toast.style.backgroundColor = "#2ecc71";
    else if (type === "danger") toast.style.backgroundColor = "#e74c3c";
    else if (type === "warning") toast.style.backgroundColor = "#f1c40f";
    else toast.style.backgroundColor = "#3498db";

    container.appendChild(toast);

    // إظهار الإشعار بأنيميشن بسيط
    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    }, 100);

    // إخفاء الإشعار تلقائياً بعد 4 ثوانٍ
    setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}