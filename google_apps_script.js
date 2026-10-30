/**
 * =========================================================================
 * GOOGLE APPS SCRIPT: ระบบบันทึกและเรียกดูรายงานการบำรุงรักษา (PM)
 * เชื่อมต่อกับ Google Drive อัตโนมัติ
 * โฟลเดอร์เป้าหมายหลัก: โฟลเดอร์ชื่อ "รายงานเข้าบำรุงรักษา(PM)" ในไดรฟ์ของฉัน (My Drive)
 * โครงสร้างโฟลเดอร์:
 *   รายงานเข้าบำรุงรักษา(PM)
 *     ├── ทะเบียนสรุปรายงานบำรุงรักษา_PM (Google Sheet สรุปประวัติทั้งหมด)
 *     ├── ครั้งที่ 1 (หรือ ครั้งที่ 2, 3...)
 *     │     └── [ชื่อจังหวัด] (เช่น กาญจนบุรี, ชลบุรี, ตรัง...)
 *     │           └── [ไฟล์รายงาน PDF / ข้อมูล]
 *     └── ครั้งที่ 2 ...
 * =========================================================================
 */

// รหัสโฟลเดอร์หลัก Google Drive (โฟลเดอร์ "รายงานเข้าบำรุงรักษา(PM)")
const ROOT_FOLDER_ID = "1diLmmVPuClBDo7XRACqV4ff7VQJvKiVw";

// ชื่อโฟลเดอร์หลักใน Google Drive สำหรับจัดเก็บข้อมูลทั้งหมด (ตรงกับโฟลเดอร์ในไดรฟ์ของคุณ 100%)
const ROOT_FOLDER_NAME = "รายงานเข้าบำรุงรักษา(PM)";

// ชื่อ Google Sheet สำหรับบันทึกประวัติสรุปข้อมูลทุกรายงาน
const SPREADSHEET_NAME = "ทะเบียนสรุปรายงานบำรุงรักษา_PM";

// ชื่อไฟล์ JSON เก็บข้อมูลตั้งค่าตารางและข้อความใต้รูปภาพส่วนกลาง และรหัสผ่านผู้ดูแล
const TEMPLATE_CONFIG_FILE_NAME = "pm_template_config.json";
const TEMPLATE_ADMIN_PASSWORD = "11223344";

/**
 * ดึงโฟลเดอร์หลักเป้าหมาย ("รายงานเข้าบำรุงรักษา(PM)") อย่างแม่นยำ 100%
 * ลำดับการค้นหา:
 * 1. ค้นหาจากชื่อโฟลเดอร์ "รายงานเข้าบำรุงรักษา(PM)" ใน Google Drive โดยตรงเป็นลำดับแรก (ตรงกับโฟลเดอร์ที่ผู้ใช้สร้างไว้ในไดรฟ์ของฉัน)
 * 2. หากค้นหาด้วยชื่อไม่พบ และมี ID ระบุมา (และไม่ใช่ ID เก่าที่ยกเลิกแล้ว) ให้ตรวจสอบจาก ID
 * 3. หากยังไม่มีโฟลเดอร์ชื่อนี้เลย จะสร้างโฟลเดอร์ใหม่ชื่อ "รายงานเข้าบำรุงรักษา(PM)" ในไดรฟ์ของฉันอัตโนมัติ
 */
function getTargetRootFolder(customFolderId) {
  // ลำดับที่ 1: ค้นหาโฟลเดอร์จากชื่อ "รายงานเข้าบำรุงรักษา(PM)" ใน Google Drive โดยตรง
  try {
    const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    while (folders.hasNext()) {
      const f = folders.next();
      if (!f.isTrashed()) {
        return f;
      }
    }
  } catch(e) {
    Logger.log("getFoldersByName error: " + e);
  }

  // ลำดับที่ 2: หากค้นหาตามชื่อไม่พบ และมี ID ระบุมา (และไม่ใช่ ID เก่า) ให้ดึงจาก ID
  const targetId = (customFolderId || ROOT_FOLDER_ID || '').toString().trim();
  if (targetId && targetId !== "1Fezq0bPD2_2x0jO50hyuDTgZQPbHYsik") {
    try {
      const folder = DriveApp.getFolderById(targetId);
      if (folder && !folder.isTrashed()) return folder;
    } catch(e) {
      Logger.log("getFolderById failed for " + targetId + ": " + e);
    }
  }

  // ลำดับที่ 3: หากยังไม่มีโฟลเดอร์ชื่อนี้ ให้สร้างโฟลเดอร์ใหม่ขึ้นในไดรฟ์ของฉัน
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

/**
 * รองรับคำขอแบบ GET (เรียกดูข้อมูลรายงาน / ตรวจสอบสถานะการเชื่อมต่อ / ซิงค์สถานะ)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'list';
    const folderIdParam = (e && e.parameter && e.parameter.rootFolderId) ? e.parameter.rootFolderId : '';
    const rootFolder = getTargetRootFolder(folderIdParam);
    const rootId = rootFolder.getId();
    const rootUrl = rootFolder.getUrl();
    const rootName = rootFolder.getName();

    // 1. ตรวจสอบสถานะ (Ping / Health Check)
    if (action === 'test' || action === 'ping') {
      let sheetUrl = '';
      try {
        const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
        if (files.hasNext()) sheetUrl = files.next().getUrl();
      } catch(e) {}
      return respondJSON({
        status: 'success',
        message: 'เชื่อมต่อ Google Apps Script และ Google Drive สำเร็จ ✓ (โฟลเดอร์: ' + rootName + ')',
        folderName: rootName,
        rootFolderId: rootId,
        rootFolderUrl: rootUrl,
        sheetUrl: sheetUrl
      });
    }

    // 2. ซิงค์รายการระหว่าง Google Drive กับ Google Sheet ทะเบียนสรุปประวัติ
    if (action === 'syncPlanStatus' || action === 'sync' || action === 'syncSummary') {
      const result = syncSummarySheetWithDrive(folderIdParam);
      return respondJSON({
        status: 'success',
        message: 'ซิงค์ข้อมูลกับ Google Drive เรียบร้อย (ปรับปรุง ' + result.prunedCount + ' รายการ)',
        data: result
      });
    }

    // 3. เรียกดูรายการรายงานทั้งหมด (เพื่อนำไปแสดงผลในตาราง "ดูข้อมูล")
    if (action === 'list' || action === 'getReports') {
      const roundFilter = (e.parameter && e.parameter.round) ? e.parameter.round : '';
      const provinceFilter = (e.parameter && e.parameter.province) ? e.parameter.province : '';
      const reports = getReportRecords(roundFilter, provinceFilter, folderIdParam);
      let sheetUrl = '';
      try {
        const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
        if (files.hasNext()) sheetUrl = files.next().getUrl();
      } catch(e) {}
      return respondJSON({
        status: 'success',
        rootFolderId: rootId,
        rootFolderName: rootName,
        rootFolderUrl: rootUrl,
        sheetUrl: sheetUrl,
        count: reports.length,
        reports: reports
      });
    }

    // 4. ตรวจสอบข้อมูลรายงานซ้ำ (เพื่อแจ้งเตือนผู้ใช้ก่อนบันทึกทับ)
    if (action === 'checkDuplicate' || action === 'check') {
      const station = (e.parameter && e.parameter.station) ? e.parameter.station : '';
      const round = (e.parameter && e.parameter.round) ? e.parameter.round : '';
      const reportType = (e.parameter && e.parameter.reportType) ? e.parameter.reportType : '';
      const reportTypeCode = (e.parameter && e.parameter.reportTypeCode) ? e.parameter.reportTypeCode : '';
      const checkResult = checkExistingReport(rootFolder, station, round, reportType, reportTypeCode);
      return respondJSON({
        status: 'success',
        exists: checkResult.exists,
        existingFile: checkResult.existingFile || null
      });
    }

    // 5. ดึงข้อมูลตั้งค่าตารางและข้อความใต้รูปภาพส่วนกลาง (เพื่อให้ทุกคนเห็นข้อมูลล่าสุดตรงกัน)
    if (action === 'getTemplateConfig' || action === 'loadTemplateConfig') {
      const cfg = getTemplateConfigFromDrive(rootFolder);
      return respondJSON({
        status: 'success',
        hasTemplateConfig: !!cfg,
        config: cfg || null
      });
    }

    return respondJSON({
      status: 'success',
      message: 'Google Apps Script PM Report API กำลังทำงานปกติ',
      rootFolderId: rootId,
      rootFolderName: rootName,
      rootFolderUrl: rootUrl
    });
  } catch (err) {
    return respondJSON({
      status: 'error',
      message: err.toString()
    });
  }
}

/**
 * รองรับคำขอแบบ POST (บันทึกรายงาน PDF, ลบรายงาน, ซิงค์สถานะ, เช็คซ้ำ)
 */
function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || 'saveReport';

    // ตรวจสอบรายงานซ้ำแบบ POST
    if (action === 'checkDuplicate' || action === 'check') {
      const rootFolder = getTargetRootFolder(payload.rootFolderId);
      const checkResult = checkExistingReport(rootFolder, payload.station, payload.round, payload.reportType, payload.reportTypeCode);
      return respondJSON({
        status: 'success',
        exists: checkResult.exists,
        existingFile: checkResult.existingFile || null
      });
    }

    // บันทึกไฟล์รายงาน PDF ลง Google Drive (ลบไฟล์เก่าทิ้งทันทีหากซ้ำ) และบันทึกลงทะเบียนสรุปรายงาน
    if (action === 'saveReport' || action === 'upload') {
      const result = saveReportToDrive(payload);
      return respondJSON({
        status: 'success',
        message: 'บันทึกรายงานลง Google Drive เรียบร้อยแล้ว ✓',
        data: result
      });
    }

    // ลบไฟล์รายงาน และลบข้อมูลออกจาก Google Sheet ทะเบียนสรุป
    if (action === 'deleteReport' || action === 'delete') {
      const result = deleteReport(payload);
      return respondJSON({
        status: 'success',
        message: result.message,
        data: result
      });
    }

    // ซิงค์ข้อมูลระหว่าง Google Drive กับ Google Sheet ทะเบียนสรุป
    if (action === 'syncPlanStatus' || action === 'sync' || action === 'syncSummary') {
      const result = syncSummarySheetWithDrive(payload.rootFolderId);
      return respondJSON({
        status: 'success',
        message: 'ซิงค์ข้อมูลเรียบร้อย (ปรับปรุง ' + result.prunedCount + ' รายการ)',
        data: result
      });
    }

    // ดึงรายการรายงานแบบ POST
    if (action === 'list') {
      const reports = getReportRecords(payload.round, payload.province, payload.rootFolderId);
      return respondJSON({
        status: 'success',
        reports: reports
      });
    }

    // บันทึกข้อมูลตั้งค่าตารางและข้อความใต้รูปภาพส่วนกลาง (ตรวจสอบรหัสผ่าน 11223344)
    if (action === 'saveTemplateConfig') {
      if ((payload.password || '').toString().trim() !== TEMPLATE_ADMIN_PASSWORD) {
        return respondJSON({ status: 'error', message: 'รหัสผ่านไม่ถูกต้อง ไม่สามารถบันทึกการตั้งค่าได้' });
      }
      const rootFolder = getTargetRootFolder(payload.rootFolderId);
      const savedCfg = saveTemplateConfigToDrive(rootFolder, payload.config);
      return respondJSON({
        status: 'success',
        message: 'บันทึกข้อมูลตารางและข้อความใต้รูปภาพเรียบร้อยแล้ว ✓',
        config: savedCfg
      });
    }

    // ดึงข้อมูลตั้งค่าตารางและข้อความใต้รูปภาพแบบ POST
    if (action === 'getTemplateConfig' || action === 'loadTemplateConfig') {
      const rootFolder = getTargetRootFolder(payload.rootFolderId);
      const cfg = getTemplateConfigFromDrive(rootFolder);
      return respondJSON({
        status: 'success',
        hasTemplateConfig: !!cfg,
        config: cfg || null
      });
    }

    return respondJSON({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return respondJSON({
      status: 'error',
      message: err.toString(),
      stack: err.stack
    });
  }
}

/**
 * ฟังก์ชันหลักในการจัดเก็บรายงานลง Google Drive ตามโครงสร้าง:
 * Root Folder -> ครั้งที่ X -> จังหวัด -> ไฟล์ PDF
 */
function saveReportToDrive(data) {
  const rootFolder = getTargetRootFolder(data.rootFolderId);

  // 1. ตรวจสอบและจัดรูปแบบชื่อ "ครั้งที่"
  let roundStr = (data.round || '1').toString().trim();
  if (!roundStr.startsWith('ครั้งที่')) {
    roundStr = 'ครั้งที่ ' + roundStr;
  }

  // 2. ตรวจสอบและจัดรูปแบบชื่อ "จังหวัด"
  let province = (data.province || 'ทั่วไป').toString().trim();
  if (!province) province = 'ทั่วไป';

  // 3. หาหรือสร้างโฟลเดอร์ "ครั้งที่ X"
  const roundFolder = getOrCreateSubFolder(rootFolder, roundStr);

  // 4. หาหรือสร้างโฟลเดอร์ "จังหวัด" ภายในโฟลเดอร์ "ครั้งที่ X"
  const provinceFolder = getOrCreateSubFolder(roundFolder, province);

  // 5. เตรียมชื่อไฟล์ PDF
  let fileName = data.filename || ('รายงานการบำรุงรักษา_' + (data.station || 'สถานี') + '.pdf');
  if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';

  // 6. ในกรณีบันทึกข้อมูลซ้ำ ให้ลบไฟล์เก่าทิ้งทันที (ทั้งใน Drive และใน Sheet ทะเบียนสรุป)
  purgeOldDuplicateReports(provinceFolder, rootFolder, data.station, roundStr, fileName, data.reportType, data.reportTypeCode);

  // 7. บันทึกไฟล์ PDF ใหม่
  let fileUrl = '';
  let fileId = '';
  if (data.pdfBase64) {
    const bytes = Utilities.base64Decode(data.pdfBase64);
    const blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
    const file = provinceFolder.createFile(blob);
    
    // ตั้งค่าสิทธิ์ให้สามารถเปิดดูผ่านลิงก์ได้
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {}
    
    fileId = file.getId();
    fileUrl = file.getUrl();
  }

  // 8. บันทึกข้อมูลสรุปลง Google Sheet ในโฟลเดอร์หลัก เพื่อให้สามารถเห็นและสรุปข้อมูลได้
  let sheetUrl = '';
  try {
    sheetUrl = logToSummarySheet(rootFolder, {
      timestamp: new Date(),
      round: roundStr,
      province: province,
      station: data.station || '-',
      reportType: data.reportType || '-',
      inspector: data.inspector || '-',
      date: data.date || '-',
      fileName: fileName,
      fileUrl: fileUrl,
      fileId: fileId,
      provinceFolderUrl: provinceFolder.getUrl(),
      roundFolderUrl: roundFolder.getUrl()
    });
  } catch (sheetErr) {
    Logger.log("Sheet log error: " + sheetErr);
  }

  return {
    fileId: fileId,
    fileName: fileName,
    fileUrl: fileUrl,
    round: roundStr,
    province: province,
    station: data.station,
    provinceFolderUrl: provinceFolder.getUrl(),
    roundFolderUrl: roundFolder.getUrl(),
    rootFolderId: rootFolder.getId(),
    rootFolderName: rootFolder.getName(),
    rootFolderUrl: rootFolder.getUrl(),
    sheetUrl: sheetUrl
  };
}

/**
 * ค้นหาโฟลเดอร์ย่อยตามชื่อ ถ้ายังไม่มีจะสร้างขึ้นมาใหม่
 */
function getOrCreateSubFolder(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(name);
}

/**
 * บันทึกประวัติการส่งรายงานลง Google Sheet ทะเบียนกลาง
 */
function logToSummarySheet(rootFolder, record) {
  let spreadsheet;
  const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
  
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
  } else {
    // ตรวจสอบว่ามีไฟล์สรุปอยู่ในไดรฟ์อยู่แล้วหรือไม่ เพื่อย้ายมาไว้ในโฟลเดอร์นี้
    const existingInDrive = DriveApp.getFilesByName(SPREADSHEET_NAME);
    let foundExisting = false;
    while (existingInDrive.hasNext()) {
      const ef = existingInDrive.next();
      if (!ef.isTrashed()) {
        try {
          ef.moveTo(rootFolder);
        } catch(e) {
          rootFolder.addFile(ef);
        }
        spreadsheet = SpreadsheetApp.open(ef);
        foundExisting = true;
        break;
      }
    }

    if (!foundExisting) {
      // สร้าง Google Sheet ใหม่และย้ายมาไว้ที่โฟลเดอร์หลัก "รายงานเข้าบำรุงรักษา(PM)" ทันที
      spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
      const sheetFile = DriveApp.getFileById(spreadsheet.getId());
      try {
        sheetFile.moveTo(rootFolder);
      } catch (e) {
        rootFolder.addFile(sheetFile);
        try { DriveApp.getRootFolder().removeFile(sheetFile); } catch(err) {}
      }

      const sheet = spreadsheet.getActiveSheet();
      sheet.setName("ประวัติรายงาน PM");
      
      // กำหนดหัวตาราง
      const headers = [
        "วันเวลาที่บันทึก",
        "ครั้งที่",
        "จังหวัด",
        "ชื่อสถานี",
        "ประเภทรายงาน",
        "ผู้บันทึก/ผู้รับผิดชอบ",
        "วันที่ดำเนินการ",
        "ชื่อไฟล์ PDF",
        "ลิงก์ไฟล์ PDF",
        "ลิงก์โฟลเดอร์จังหวัด",
        "ลิงก์โฟลเดอร์ครั้งที่",
        "รหัสไฟล์ (File ID)"
      ];
      sheet.appendRow(headers);
      
      // ตกแต่งหัวตาราง
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold")
                 .setBackground("#1d4ed8")
                 .setFontColor("#ffffff")
                 .setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
      sheet.setRowHeight(1, 35);
    }
  }

  const sheet = spreadsheet.getActiveSheet();
  const dateFormatted = Utilities.formatDate(record.timestamp, "Asia/Bangkok", "dd/MM/yyyy HH:mm:ss");

  sheet.appendRow([
    dateFormatted,
    record.round,
    record.province,
    record.station,
    record.reportType,
    record.inspector,
    record.date,
    record.fileName,
    record.fileUrl,
    record.provinceFolderUrl,
    record.roundFolderUrl,
    record.fileId || ''
  ]);

  return spreadsheet.getUrl();
}

/**
 * ดึงรายการบันทึกรายงานจาก Google Sheet (หรือสแกนโฟลเดอร์)
 */
function getReportRecords(roundFilter, provinceFilter, customFolderId) {
  const rootFolder = getTargetRootFolder(customFolderId);
  const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
  const results = [];

  // วิธีที่ 1: ดึงจาก Google Sheet (เร็วและมีข้อมูลครบ)
  if (files.hasNext()) {
    try {
      const spreadsheet = SpreadsheetApp.open(files.next());
      const sheet = spreadsheet.getActiveSheet();
      const data = sheet.getDataRange().getValues();

      if (data.length > 1) {
        // วนลูปจากแถวล่าสุดขึ้นไปข้างบน
        for (let i = data.length - 1; i >= 1; i--) {
          const row = data[i];
          const rowRound = (row[1] || '').toString();
          const rowProvince = (row[2] || '').toString();
          const rowStation = (row[3] || '').toString();

          if (rowStation === '__PM_SYSTEM_TEMPLATE_CONFIG__' && provinceFilter !== '_SYSTEM_TEMPLATE_CONFIG') continue;
          if (roundFilter && !rowRound.includes(roundFilter)) continue;
          if (provinceFilter && !rowProvince.includes(provinceFilter)) continue;

          results.push({
            timestamp: row[0],
            round: row[1],
            province: row[2],
            station: row[3],
            reportType: row[4],
            inspector: row[5],
            date: row[6],
            fileName: row[7],
            fileUrl: row[8],
            provinceFolderUrl: row[9],
            roundFolderUrl: row[10],
            fileId: row[11] || ''
          });
        }
        return results;
      }
    } catch (e) {
      Logger.log("Error reading sheet: " + e);
    }
  }

  // วิธีที่ 2 (สำรอง): สแกนหาไฟล์จากโครงสร้างโฟลเดอร์ Google Drive โดยตรง
  try {
    const roundFolders = rootFolder.getFolders();
    while (roundFolders.hasNext()) {
      const rFolder = roundFolders.next();
      const rName = rFolder.getName();
      if (!rName.includes('ครั้งที่')) continue;
      if (roundFilter && !rName.includes(roundFilter)) continue;

      const provFolders = rFolder.getFolders();
      while (provFolders.hasNext()) {
        const pFolder = provFolders.next();
        const pName = pFolder.getName();
        if (provinceFilter && !pName.includes(provinceFilter)) continue;

        const pdfFiles = pFolder.getFiles();
        while (pdfFiles.hasNext()) {
          const file = pdfFiles.next();
          if (file.isTrashed()) continue;
          if (!file.getName().toLowerCase().endsWith('.pdf')) continue;
          
          results.push({
            timestamp: Utilities.formatDate(file.getDateCreated(), "Asia/Bangkok", "dd/MM/yyyy HH:mm"),
            round: rName,
            province: pName,
            station: file.getName().replace(/^รายงานการบำรุงรักษา_[^_]+_/, '').replace('.pdf', ''),
            reportType: '-',
            inspector: '-',
            date: '-',
            fileName: file.getName(),
            fileUrl: file.getUrl(),
            provinceFolderUrl: pFolder.getUrl(),
            roundFolderUrl: rFolder.getUrl(),
            fileId: file.getId()
          });
        }
      }
    }
  } catch (e) {
    Logger.log("Folder scan error: " + e);
  }

  return results;
}

/**
 * ลบรายงานออกจาก Google Drive และทะเบียนสรุปประวัติ
 */
function deleteReport(payload) {
  let fileId = payload.fileId;
  const fileName = payload.fileName || payload.filename;
  const roundStr = payload.round || '';
  const station = payload.station || '';
  const province = payload.province || '';

  const rootFolder = getTargetRootFolder(payload.rootFolderId);

  // 1. ย้ายไฟล์ลงถังขยะ
  if (fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
    } catch(e) {
      Logger.log("Delete file by ID error: " + e);
    }
  }
  
  if (fileName) {
    try {
      let rFolder = rootFolder;
      if (roundStr) {
        const rName = roundStr.startsWith('ครั้งที่') ? roundStr : ('ครั้งที่ ' + roundStr);
        const rFolders = rootFolder.getFoldersByName(rName);
        if (rFolders.hasNext()) rFolder = rFolders.next();
      }
      let pFolder = rFolder;
      if (province) {
        const pFolders = rFolder.getFoldersByName(province);
        if (pFolders.hasNext()) pFolder = pFolders.next();
      }
      const files = pFolder.getFilesByName(fileName);
      while (files.hasNext()) {
        files.next().setTrashed(true);
      }
    } catch(e) {
      Logger.log("Delete file search error: " + e);
    }
  }

  // 2. ลบแถวออกจาก Google Sheet สรุปประวัติ
  try {
    removeSummarySheetEntry(rootFolder, fileId, fileName, station, roundStr);
  } catch(e) {
    Logger.log("Remove summary sheet entry error: " + e);
  }

  return {
    success: true,
    message: 'ลบไฟล์รายงานและข้อมูลในทะเบียนสรุปเรียบร้อยแล้ว ✓'
  };
}

/**
 * ลบแถวข้อมูลออกจาก Google Sheet ทะเบียนสรุป
 */
function removeSummarySheetEntry(rootFolder, fileId, fileName, station, roundStr) {
  const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
  if (!files.hasNext()) return;

  const spreadsheet = SpreadsheetApp.open(files.next());
  const sheet = spreadsheet.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const rName = (roundStr || '').toString().trim();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const rowRound = (row[1] || '').toString().trim();
    const rowStation = (row[3] || '').toString().trim();
    const rowFileName = (row[7] || '').toString().trim();
    const rowFileUrl = (row[8] || '').toString().trim();
    const rowFileId = (row[11] || '').toString().trim();

    let isMatch = false;
    if (fileId && (rowFileId === fileId || rowFileUrl.includes(fileId))) isMatch = true;
    else if (fileName && rowFileName === fileName) isMatch = true;
    else if (station && rowStation === station && (!rName || rowRound.includes(rName))) isMatch = true;

    if (isMatch) {
      sheet.deleteRow(i + 1);
      Logger.log("Deleted row " + (i + 1) + " from summary sheet");
      break;
    }
  }
}

/**
 * ตัดคำนำหน้าและคำสร้อยเพื่อเทียบชื่อสถานีอย่างแม่นยำ 100%
 * รองรับ: ที่ว่าการอำเภอ..., อำเภอ..., แม่ข่าย Base Station..., Base Station..., BS..., สถานีฐาน...
 */
function cleanStationName(name) {
  if (!name) return '';
  return name.toString().trim()
    .replace(/^(วิทยุลูกข่ายชนิดประจำที่|สถานีวิทยุลูกข่าย|สถานีวิทยุแม่ข่าย|สถานีแม่ข่าย|สถานีฐาน|สถานี)\s*/gi, '')
    .replace(/^(แม่ข่าย\s*(base\s*station)?|base\s*station|bs)\s*/gi, '')
    .replace(/^ที่ว่าการอำเภอ\s*/gi, '')
    .replace(/^อำเภอ\s*/gi, '')
    .replace(/[_\s\-\.]+/g, '')
    .toLowerCase();
}

/**
 * เปรียบเทียบชื่อสถานีอย่างแม่นยำระหว่างข้อมูลในฟอร์มกับใน Sheet (ต้องตรงกันเท่านั้น ห้ามใช้ fuzzy includes)
 */
function matchStationName(sheetStation, targetStation) {
  if (!sheetStation || !targetStation) return false;
  const s1 = sheetStation.toString().trim();
  const s2 = targetStation.toString().trim();
  if (s1 === s2) return true;

  const c1 = cleanStationName(s1);
  const c2 = cleanStationName(s2);
  if (c1 && c2 && c1 === c2) return true;

  return false;
}

/**
 * สกัดประเภทรายงานและชื่อสถานีจากชื่อไฟล์ PDF อย่างแม่นยำ
 * แยกหมวดหมู่ออกเป็น 4 หมวดหลัก:
 * - ag: Analog Gateway
 * - bs: Base Station
 * - ms: สถานีวิทยุลูกข่าย
 * - cc: ศูนย์ควบคุม
 * - isTower: รายงานเสาสื่อสาร/เสารับ-ส่งสัญญาณ
 */
function parsePdfFileName(fileName) {
  if (!fileName) return null;
  let fn = fileName.toString().trim();
  if (fn.toLowerCase().endsWith('.pdf')) {
    fn = fn.substring(0, fn.length - 4);
  }

  // 1. ตรวจสอบว่าเป็นรายงานเสาสื่อสารหรือไม่
  if (isTowerReport(fileName)) {
    return { isTower: true };
  }

  // 2. ตรวจสอบประเภทรายงาน
  let category = '';
  let station = '';

  if (fn.includes('Analog_Gateway') || fn.includes('analog_gateway')) {
    category = 'ag';
    station = fn.replace(/^.*Analog_Gateway_/i, '');
  } else if (fn.includes('Base_Station') || fn.includes('base_station')) {
    category = 'bs';
    station = fn.replace(/^.*Base_Station_/i, '');
  } else if (fn.includes('สถานีวิทยุลูกข่าย')) {
    category = 'ms';
    station = fn.replace(/^.*สถานีวิทยุลูกข่าย_/i, '');
  } else if (fn.includes('ศูนย์ควบคุม') || fn.includes('BSSC')) {
    category = 'cc';
    station = fn.replace(/^.*ศูนย์ควบคุม_/i, '').replace(/^.*BSSC_/i, '');
  } else {
    // กรณีชื่อไฟล์แบบเดิม เช่น รายงานการบำรุงรักษา_ที่ว่าการอำเภอย่านตาขาว
    let cleaned = fn.replace(/^รายงานการบำรุงรักษา_[^_]+_/, '');
    cleaned = cleaned.replace(/^รายงานการบำรุงรักษา_/, '');
    station = cleaned;

    if (station.startsWith('ที่ว่าการอำเภอ') || station.startsWith('อำเภอ')) {
      category = 'ag';
    } else if (station.startsWith('BS') || station.startsWith('แม่ข่าย')) {
      category = 'bs';
    } else if (station.startsWith('ศูนย์')) {
      category = 'cc';
    } else {
      category = 'ms';
    }
  }

  station = station.replace(/_/g, ' ').trim();

  return {
    isTower: false,
    category: category,
    station: station,
    cleanStation: cleanStationName(station)
  };
}

/**
 * สแกนไฟล์จริงใน Google Drive และซิงค์รายการใน Google Sheet ทะเบียนสรุปประวัติให้ตรงกัน
 * ลบแถวในทะเบียนสรุปรายงานบำรุงรักษา_PM ที่ไฟล์ถูกลบออกจาก Drive ไปแล้วอัตโนมัติ
 */
function syncSummarySheetWithDrive(customFolderId) {
  const rootFolder = getTargetRootFolder(customFolderId);
  const activeFileIds = {};
  const activeFileNames = {};
  let prunedCount = 0;

  try {
    const rFolders = rootFolder.getFolders();
    while (rFolders.hasNext()) {
      const rf = rFolders.next();
      const rName = rf.getName();
      if (!rName.includes('ครั้งที่')) continue;

      const pFolders = rf.getFolders();
      while (pFolders.hasNext()) {
        const pf = pFolders.next();
        const files = pf.getFiles();
        while (files.hasNext()) {
          const file = files.next();
          if (file.isTrashed()) continue;
          const fname = file.getName();
          if (!fname.toLowerCase().endsWith('.pdf')) continue;

          activeFileIds[file.getId()] = true;
          activeFileNames[fname] = true;
        }
      }
    }
  } catch(e) {
    Logger.log("Drive scan error in sync: " + e);
  }

  // ซิงค์และล้างแถวที่ไฟล์ถูกลบออกจาก Google Drive ใน Google Sheet ทะเบียนสรุปประวัติ
  try {
    const summaryFiles = rootFolder.getFilesByName(SPREADSHEET_NAME);
    if (summaryFiles.hasNext()) {
      const sumSS = SpreadsheetApp.open(summaryFiles.next());
      const sumSheet = sumSS.getActiveSheet();
      const sumData = sumSheet.getDataRange().getValues();
      if (sumData.length > 1) {
        for (let i = sumData.length - 1; i >= 1; i--) {
          const row = sumData[i];
          const rowFileName = (row[7] || '').toString().trim();
          const rowFileId = (row[11] || '').toString().trim();

          let exists = false;
          if (rowFileId && activeFileIds[rowFileId]) exists = true;
          else if (rowFileName && activeFileNames[rowFileName]) exists = true;

          if (!exists && (rowFileId || rowFileName)) {
            sumSheet.deleteRow(i + 1);
            prunedCount++;
            Logger.log("Auto-pruned deleted report from summary sheet: " + rowFileName + " (Row " + (i + 1) + ")");
          }
        }
      }
    }
  } catch(sumErr) {
    Logger.log("Error pruning summary sheet in sync: " + sumErr);
  }

  return {
    success: true,
    prunedCount: prunedCount
  };
}

/**
 * ฟังก์ชันสำรองสำหรับ Backward Compatibility หากมีการเรียก syncPlanSpreadsheetWithDrive
 */
function syncPlanSpreadsheetWithDrive(customFolderId) {
  return syncSummarySheetWithDrive(customFolderId);
}

/**
 * ตรวจสอบว่ารายงานนี้เป็นรายงานประเภทเสาสื่อสาร / เสากระจายสัญญาณ / เสารับ-ส่งสัญญาณ หรือไม่
 */
function isTowerReport(dataOrName) {
  if (!dataOrName) return false;
  let str = '';
  if (typeof dataOrName === 'string') {
    str = dataOrName;
  } else if (typeof dataOrName === 'object') {
    str = [
      dataOrName.reportTypeCode || '',
      dataOrName.reportType || '',
      dataOrName.filename || '',
      dataOrName.fileName || '',
      dataOrName.name || ''
    ].join(' ');
  }
  str = str.toLowerCase();

  if (str.includes('pole60') || str.includes('pole9')) return true;
  if (str.includes('เสาสื่อสาร')) return true;
  if (str.includes('เสากระจายสัญญาณ')) return true;
  if (str.includes('เสารับ-ส่งสัญญาณ') || str.includes('เสารับส่งสัญญาณ')) return true;

  return false;
}

/**
 * ตรวจสอบว่ามีรายงานของสถานีนี้ ในครั้งที่และประเภทรายงานนี้อยู่แล้วหรือไม่
 * เพื่อส่งข้อมูลกลับไปแจ้งเตือนผู้ใช้ก่อนบันทึกทับ
 */
function checkExistingReport(rootFolder, station, round, reportType, reportTypeCode) {
  if (!station) return { exists: false };
  const rName = (round || '1').toString().trim();
  const roundNum = rName.replace(/[^0-9]/g, '') || '1';
  const roundFull = 'ครั้งที่ ' + roundNum;
  const targetTower = isTowerReport({ reportType: reportType, reportTypeCode: reportTypeCode });
  const targetCategory = (reportTypeCode || '').toString().toLowerCase();

  // 1. ตรวจสอบจาก Google Sheet สรุปประวัติ
  try {
    const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
    if (files.hasNext()) {
      const ss = SpreadsheetApp.open(files.next());
      const sheet = ss.getActiveSheet();
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        for (let i = data.length - 1; i >= 1; i--) {
          const row = data[i];
          const rowRound = (row[1] || '').toString().trim();
          const rowStation = (row[3] || '').toString().trim();
          const rowType = (row[4] || '').toString().trim();
          const rowFileName = (row[7] || '').toString().trim();

          const rowRoundNum = rowRound.replace(/[^0-9]/g, '');
          if (rowRoundNum === roundNum && matchStationName(rowStation, station)) {
            const rowIsTower = isTowerReport({ reportType: rowType, filename: rowFileName });
            if (rowIsTower === targetTower) {
              const rowParsed = parsePdfFileName(rowFileName);
              const rowCategory = rowParsed ? rowParsed.category : '';
              if (!targetTower && targetCategory && rowCategory && rowCategory !== targetCategory) {
                continue; // คนละหมวดหมู่กัน ไม่ถือว่าซ้ำ
              }
              return {
                exists: true,
                existingFile: {
                  timestamp: row[0] || '',
                  round: row[1] || '',
                  province: row[2] || '',
                  station: row[3] || '',
                  reportType: row[4] || '',
                  inspector: row[5] || '',
                  date: row[6] || '',
                  fileName: row[7] || '',
                  fileUrl: row[8] || '',
                  fileId: row[11] || ''
                }
              };
            }
          }
        }
      }
    }
  } catch(e) {
    Logger.log("checkExistingReport sheet error: " + e);
  }

  // 2. ตรวจสอบจากโฟลเดอร์ Google Drive โดยตรง
  try {
    const rFolders = rootFolder.getFoldersByName(roundFull);
    if (rFolders.hasNext()) {
      const rf = rFolders.next();
      const pFolders = rf.getFolders();
      while (pFolders.hasNext()) {
        const pf = pFolders.next();
        const pFiles = pf.getFiles();
        while (pFiles.hasNext()) {
          const file = pFiles.next();
          if (file.isTrashed()) continue;
          const fname = file.getName();
          if (!fname.toLowerCase().endsWith('.pdf')) continue;

          let stName = fname.replace(/\.pdf$/i, '').trim();
          stName = stName.replace(/^รายงานการบำรุงรักษา_[^_]+_/, '');
          stName = stName.replace(/^[A-Za-z0-9_-]+_/, '');
          if (matchStationName(stName, station)) {
            const fileIsTower = isTowerReport(fname);
            if (fileIsTower === targetTower) {
              const fileParsed = parsePdfFileName(fname);
              const fileCategory = fileParsed ? fileParsed.category : '';
              if (!targetTower && targetCategory && fileCategory && fileCategory !== targetCategory) {
                continue; // คนละหมวดหมู่กัน
              }
              return {
                exists: true,
                existingFile: {
                  timestamp: Utilities.formatDate(file.getDateCreated(), "Asia/Bangkok", "dd/MM/yyyy HH:mm"),
                  round: roundFull,
                  province: pf.getName(),
                  station: station,
                  reportType: targetTower ? 'เสาสื่อสาร/เสารับ-ส่งสัญญาณ' : 'รายงานการบำรุงรักษา',
                  fileName: fname,
                  fileUrl: file.getUrl(),
                  fileId: file.getId()
                }
              };
            }
          }
        }
      }
    }
  } catch(e) {
    Logger.log("checkExistingReport drive error: " + e);
  }

  return { exists: false };
}

/**
 * ลบไฟล์เก่าทิ้งทันทีเมื่อมีการบันทึกข้อมูลซ้ำ (ทั้งไฟล์ใน Google Drive และแถวเดิมใน Sheet ทะเบียนสรุป)
 */
function purgeOldDuplicateReports(provinceFolder, rootFolder, station, roundStr, newFileName, reportType, reportTypeCode) {
  if (!station) return;
  const targetParsed = parsePdfFileName(newFileName || '');
  const targetCategory = targetParsed ? targetParsed.category : (reportTypeCode || '').toString().toLowerCase();
  const targetTower = isTowerReport({ reportType: reportType, reportTypeCode: reportTypeCode, filename: newFileName });
  const cleanTargetSt = cleanStationName(station);

  // 1. ลบไฟล์เก่าในโฟลเดอร์จังหวัด
  try {
    const files = provinceFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      const fname = file.getName();
      if (!fname.toLowerCase().endsWith('.pdf')) continue;

      let isDuplicate = false;
      // ก. ชื่อไฟล์ตรงกัน 100%
      if (fname === newFileName) {
        isDuplicate = true;
      } else {
        // ข. สถานีเดียวกัน และประเภทรายงานเดียวกัน
        const fileParsed = parsePdfFileName(fname);
        if (fileParsed) {
          if (fileParsed.isTower === targetTower) {
            if (targetTower || !targetCategory || fileParsed.category === targetCategory) {
              if (fileParsed.cleanStation === cleanTargetSt || matchStationName(fileParsed.station, station)) {
                isDuplicate = true;
              }
            }
          }
        }
      }

      if (isDuplicate) {
        file.setTrashed(true);
        Logger.log("Purged old duplicate file from Drive: " + fname + " (ID: " + file.getId() + ")");
      }
    }
  } catch (e) {
    Logger.log("purgeOldDuplicateReports Drive error: " + e);
  }

  // 2. ลบแถวข้อมูลเดิมออกจาก Google Sheet ทะเบียนสรุป
  try {
    const summaryFiles = rootFolder.getFilesByName(SPREADSHEET_NAME);
    if (summaryFiles.hasNext()) {
      const ss = SpreadsheetApp.open(summaryFiles.next());
      const sheet = ss.getActiveSheet();
      const data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        const roundNum = (roundStr || '').toString().replace(/[^0-9]/g, '');
        for (let i = data.length - 1; i >= 1; i--) {
          const row = data[i];
          const rowRound = (row[1] || '').toString().trim();
          const rowRoundNum = rowRound.replace(/[^0-9]/g, '');
          const rowStation = (row[3] || '').toString().trim();
          const rowType = (row[4] || '').toString().trim();
          const rowFileName = (row[7] || '').toString().trim();

          if (roundNum && rowRoundNum === roundNum && matchStationName(rowStation, station)) {
            const rowIsTower = isTowerReport({ reportType: rowType, filename: rowFileName });
            const rowParsed = parsePdfFileName(rowFileName);
            const rowCategory = rowParsed ? rowParsed.category : '';
            if (rowFileName === newFileName || (rowIsTower === targetTower && (targetTower || !targetCategory || rowCategory === targetCategory))) {
              sheet.deleteRow(i + 1);
              Logger.log("Purged old duplicate row " + (i + 1) + " from summary sheet (" + rowFileName + ")");
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("purgeOldDuplicateReports Sheet error: " + e);
  }
}

/**
 * บันทึกไฟล์ JSON การตั้งค่าตารางและข้อความใต้รูปภาพลงในโฟลเดอร์หลัก Google Drive
 */
function saveTemplateConfigToDrive(rootFolder, configObj) {
  const existing = getTemplateConfigFromDrive(rootFolder) || { version: 1, types: {} };
  const merged = {
    version: 1,
    updatedAt: (configObj && configObj.updatedAt) ? configObj.updatedAt : new Date().toISOString(),
    types: Object.assign({}, existing.types || {}, (configObj && configObj.types) ? configObj.types : {})
  };
  if (configObj && configObj.replaceAllTypes && configObj.types) {
    merged.types = configObj.types;
  }

  const files = rootFolder.getFilesByName(TEMPLATE_CONFIG_FILE_NAME);
  while (files.hasNext()) {
    try { files.next().setTrashed(true); } catch (e) {}
  }

  const jsonStr = JSON.stringify(merged);
  const file = rootFolder.createFile(TEMPLATE_CONFIG_FILE_NAME, jsonStr, MimeType.PLAIN_TEXT);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  return merged;
}

/**
 * อ่านไฟล์ JSON การตั้งค่าตารางและข้อความใต้รูปภาพจากโฟลเดอร์หลัก Google Drive
 */
function getTemplateConfigFromDrive(rootFolder) {
  try {
    const files = rootFolder.getFilesByName(TEMPLATE_CONFIG_FILE_NAME);
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const content = f.getBlob().getDataAsString("UTF-8");
      if (content) return JSON.parse(content);
    }
  } catch (e) {
    Logger.log("getTemplateConfigFromDrive error: " + e);
  }
  // Fallback: ตรวจสอบข้อมูลตั้งค่าใน Google Sheet กรณีเคยบันทึกผ่านโหมดสำรอง
  try {
    const sFiles = rootFolder.getFilesByName(SPREADSHEET_NAME);
    if (sFiles.hasNext()) {
      const ss = SpreadsheetApp.open(sFiles.next());
      const rows = ss.getActiveSheet().getDataRange().getValues();
      for (let i = rows.length - 1; i >= 1; i--) {
        if ((rows[i][3] || '').toString() === '__PM_SYSTEM_TEMPLATE_CONFIG__') {
          let p1 = (rows[i][5] || '').toString();
          let p2 = (rows[i][6] || '').toString();
          if (p1.startsWith('PMCFG1:')) p1 = p1.substring(7);
          p2 = p2.startsWith('PMCFG2:') ? p2.substring(7) : '';
          return JSON.parse(p1 + p2);
        }
      }
    }
  } catch (e2) {}
  return null;
}

/**
 * ตอบกลับผลลัพธ์เป็น JSON พร้อมตั้งค่า CORS Header ให้เว็บเรียกใช้งานได้
 */
function respondJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
