# -*- coding: utf-8 -*-
import sys
import os
import time
import traceback
import re

delay = float(os.environ.get("PYKNW_STEP_DELAY", "0.3"))
target_script = sys.argv[1]
target_abs = os.path.abspath(target_script)

def trace_callback(frame, event, arg):
    if event == 'line':
        curr_file = os.path.abspath(frame.f_code.co_filename)
        if curr_file == target_abs:
            line = frame.f_lineno
            sys.stdout.flush()
            sys.stderr.flush()
            print(f"__PYKNW_LINE__:{line}", flush=True)
            if delay > 0:
                time.sleep(delay)
    return trace_callback

def translate_error(exc_type, exc_value, tb, script_path):
    type_name = exc_type.__name__
    raw_msg = str(exc_value)

    line_no = None
    line_code = None
    thai_title = type_name
    thai_desc = raw_msg

    if isinstance(exc_value, SyntaxError):
        line_no = exc_value.lineno
        line_code = exc_value.text.strip() if exc_value.text else ""

        if isinstance(exc_value, IndentationError):
            thai_title = "IndentationError (ข้อผิดพลาดการย่อหน้า / เว้นวรรค)"
            if "expected an indented block" in raw_msg:
                thai_desc = "ขาดบล็อกคำสั่งย่อหน้า: บรรทัดนี้ต้องมีการเคาะ Spacebar หรือกด Tab ย่อหน้าเข้าไป (มักเกิดขึ้นหลังคำสั่ง def, if, else, for, while, try)"
            elif "unindent does not match" in raw_msg:
                thai_desc = "การย่อหน้าระดับไม่ตรงกัน: ระดับการเว้นวรรคไม่ตรงกับบล็อกก่อนหน้า แนะนำให้ตรวจสอบจำนวนช่องว่างหรือ Tab ให้เท่ากันสม่ำเสมอ"
            elif "unexpected indent" in raw_msg:
                thai_desc = "มีการย่อหน้าเกินมาโดยไม่จำเป็น: บรรทัดนี้ไม่ควรมีการเว้นวรรคหรือกด Tab นำหน้า"
            else:
                thai_desc = f"การย่อหน้าหรือเว้นวรรคมีรูปแบบไม่ถูกต้อง: {raw_msg}"
        else:
            thai_title = "SyntaxError (ข้อผิดพลาดทางไวยากรณ์ภาษา)"
            if "expected ':'" in raw_msg:
                thai_desc = "ลืมใส่เครื่องหมายโคลอน (:): ในภาษา Python ท้ายประโยคของคำสั่ง def, if, elif, else, for, while, class, try, except ต้องลงท้ายด้วยเครื่องหมายโคลอน (:) เสมอ"
            elif "unmatched" in raw_msg or "was never closed" in raw_msg or "closing parenthesis" in raw_msg:
                thai_desc = "เครื่องหมายวงเล็บไม่ตรงคู่กัน: ตรวจสอบว่ามีวงเล็บเปิด (), [], {} หรือเครื่องหมายคำพูด (' หรือ \") ที่เปิดไว้แต่ลืมปิด หรือปิดผิดคู่หรือไม่"
            elif "unexpected EOF while parsing" in raw_msg:
                thai_desc = "โค้ดจบลงก่อนกำหนด: โค้ดยังเขียนไม่สมบูรณ์ หรือลืมปิดวงเล็บ/เครื่องหมายคำพูดที่เปิดค้างไว้"
            elif "cannot assign to" in raw_msg:
                thai_desc = "ไม่สามารถกำหนดค่าในตำแหน่งนี้ได้: ฝั่งซ้ายของเครื่องหมายเท่ากับ (=) ต้องเป็นชื่อตัวแปรเท่านั้น ไม่สามารถเป็นตัวเลขหรือนิพจน์คำนวณได้"
            elif "invalid syntax" in raw_msg:
                thai_desc = "ไวยากรณ์ไม่ถูกต้อง: กรุณาตรวจสอบว่าสะกดคำสั่งถูกต้อง ลืมใส่เครื่องหมาย หรือใส่เครื่องหมายเกินมาหรือไม่"
            else:
                thai_desc = f"ไวยากรณ์โค้ดมีรูปแบบไม่ถูกต้องตามหลักภาษา Python: {raw_msg}"
    else:
        # Runtime Exceptions
        tb_frames = traceback.extract_tb(tb)
        user_frames = [f for f in tb_frames if os.path.abspath(f.filename) == target_abs]
        if user_frames:
            target_frame = user_frames[-1]
            line_no = target_frame.lineno
            line_code = target_frame.line
        elif tb_frames:
            target_frame = tb_frames[-1]
            line_no = target_frame.lineno
            line_code = target_frame.line

        if type_name == "NameError":
            thai_title = "NameError (เรียกใช้ชื่อตัวแปรหรือฟังก์ชันที่ไม่มีอยู่)"
            m = re.search(r"name '([^']+)' is not defined", raw_msg)
            if m:
                var_name = m.group(1)
                thai_desc = f"ไม่พบตัวแปรหรือฟังก์ชันชื่อ '{var_name}': อาจพิมพ์ชื่อผิด, ตัวพิมพ์เล็ก/ใหญ่ไม่ตรงกัน, หรือยังไม่ได้ประกาศค่าตัวแปร '{var_name}' ก่อนนำมาเรียกใช้"
            else:
                thai_desc = f"เรียกใช้ชื่อที่ระบบไม่รู้จัก: {raw_msg}"

        elif type_name == "TypeError":
            thai_title = "TypeError (ชนิดข้อมูลไม่ตรงตามที่ต้องการ)"
            if "can only concatenate str" in raw_msg:
                thai_desc = "ไม่สามารถนำข้อความ (str) มาบวกต่อกับตัวเลขโดยตรงได้: ให้แปลงตัวเลขเป็นข้อความก่อน เช่น str(ตัวแปร) หรือใช้ f-string เช่น f\"{ตัวแปร}\""
            elif "unsupported operand type" in raw_msg:
                thai_desc = f"ไม่สามารถนำข้อมูลต่างชนิดกันมาคำนวณด้วยเครื่องหมายนี้ได้: {raw_msg} (ตรวจสอบว่าตัวแปรเป็นตัวเลขหรือข้อความ)"
            elif "missing" in raw_msg and "required positional argument" in raw_msg:
                thai_desc = f"เรียกใช้ฟังก์ชันโดยส่งค่าพารามิเตอร์ไม่ครบตามที่กำหนด: {raw_msg}"
            elif "takes" in raw_msg and "positional arguments but" in raw_msg:
                thai_desc = f"ส่งค่าให้ฟังก์ชันเกินจำนวนที่ฟังก์ชันกำหนดไว้: {raw_msg}"
            elif "'NoneType' object is not subscriptable" in raw_msg:
                thai_desc = "พยายามเข้าถึงสมาชิกของค่าว่าง (None): ตัวแปรนี้ยังไม่มีค่า หรือฟังก์ชันไม่ได้ return ค่าใดๆ ออกมา"
            elif "'NoneType' object has no attribute" in raw_msg:
                thai_desc = "พยายามเรียกฟังก์ชันจากตัวแปรที่มีค่าเป็น None: ตัวแปรอาจไม่มีค่า หรือฟังก์ชันก่อนหน้าไม่ได้ส่งค่ากลับมา"
            else:
                thai_desc = f"ชนิดข้อมูลไม่ถูกต้องสำหรับการดำเนินการนี้: {raw_msg}"

        elif type_name == "ZeroDivisionError":
            thai_title = "ZeroDivisionError (เกิดการหารด้วยศูนย์)"
            thai_desc = "เกิดการหารหรือหารเอาเศษ (%) ด้วยเลข 0: ในทางคณิตศาสตร์และคอมพิวเตอร์ไม่สามารถนำศูนย์มาเป็นตัวหารได้"

        elif type_name == "IndexError":
            thai_title = "IndexError (ตำแหน่ง Index เกินขอบเขตของลิสต์)"
            thai_desc = "พยายามเข้าถึงตำแหน่งข้อมูลที่ไม่มีอยู่จริงใน List: เช่น ลิสต์มี 3 สมาชิก แต่อ้างอิงตำแหน่งที่ 3 ขึ้นไป (index เริ่มต้นจาก 0) หรือลิสต์เป็นค่าว่าง []"

        elif type_name == "KeyError":
            thai_title = "KeyError (ไม่พบคีย์นี้ใน Dictionary)"
            thai_desc = f"ไม่พบคีย์ {raw_msg} ใน Dictionary: แนะนำให้ตรวจการสะกดชื่อคีย์ หรือใช้คำสั่ง .get({raw_msg}) แทนเพื่อป้องกันข้อผิดพลาด"

        elif type_name == "ValueError":
            thai_title = "ValueError (ค่าของข้อมูลไม่ถูกต้อง)"
            if "invalid literal for int()" in raw_msg:
                thai_desc = f"ไม่สามารถแปลงข้อความเป็นตัวเลขจำนวนเต็ม (int) ได้เนื่องจากข้อความไม่ใช่รูปแบบตัวเลข: {raw_msg}"
            elif "not enough values to unpack" in raw_msg:
                thai_desc = "จำนวนตัวแปรที่รับค่าไม่พอดีกับจำนวนข้อมูลที่ส่งออกมา (Unpack error)"
            elif "too many values to unpack" in raw_msg:
                thai_desc = "ข้อมูลที่ส่งออกมามีจำนวนมากกว่าตัวแปรที่มารับค่า"
            else:
                thai_desc = f"ค่าที่ส่งให้คำสั่งหรือฟังก์ชันไม่ถูกต้องเหมาะสม: {raw_msg}"

        elif type_name == "AttributeError":
            thai_title = "AttributeError (ไม่มีคุณสมบัติหรือฟังก์ชันนี้)"
            m = re.search(r"'([^']+)' object has no attribute '([^']+)'", raw_msg)
            if m:
                obj_name, attr_name = m.group(1), m.group(2)
                thai_desc = f"ข้อมูลชนิด '{obj_name}' ไม่มีฟังก์ชันหรือคำสั่งชื่อ '{attr_name}': อาจสะกดชื่อฟังก์ชันผิด หรือตัวแปรไม่ได้เป็นชนิดข้อมูลตามที่คิดไว้"
            else:
                thai_desc = f"วัตถุหรือตัวแปรนี้ไม่มีแอตทริบิวต์ตามที่ระบุ: {raw_msg}"

        elif type_name in ("ModuleNotFoundError", "ImportError"):
            thai_title = "ModuleNotFoundError (ไม่พบโมดูลหรือไลบรารี)"
            m = re.search(r"No module named '([^']+)'", raw_msg)
            if m:
                mod_name = m.group(1)
                thai_desc = f"ไม่พบไลบรารีชื่อ '{mod_name}': ตรวจสอบการสะกดชื่อ หรือโมดูลนี้อาจยังไม่ได้ถูกติดตั้งลงในระบบ"
            else:
                thai_desc = f"ไม่สามารถนำเข้าโมดูลได้: {raw_msg}"

        elif type_name == "FileNotFoundError":
            thai_title = "FileNotFoundError (ไม่พบไฟล์ตามที่ระบุ)"
            thai_desc = f"ไม่พบไฟล์หรือไดเรกทอรีที่ต้องการเปิด: ตรวจสอบชื่อไฟล์และโฟลเดอร์ให้ถูกต้อง ({raw_msg})"

        elif type_name == "RecursionError":
            thai_title = "RecursionError (ฟังก์ชันเรียกตัวเองซ้ำมากเกินไป)"
            thai_desc = "ฟังก์ชันมีการเรียกตัวเองซ้ำๆ เกินขีดจำกัด (Infinite Loop ในฟังก์ชันแบบ Recursion): กรุณาตรวจสอบเงื่อนไขการหยุดทำงาน (Base Case)"

        elif type_name == "UnboundLocalError":
            thai_title = "UnboundLocalError (เรียกใช้ตัวแปรในฟังก์ชันก่อนกำหนดค่า)"
            thai_desc = f"มีการเรียกใช้ตัวแปรภายในฟังก์ชันก่อนที่ตัวแปรนั้นจะได้รับการกำหนดค่าเริ่มต้น: {raw_msg}"

        else:
            thai_title = f"{type_name} (ข้อผิดพลาดในการประมวลผล)"
            thai_desc = raw_msg

    return {
        "title": thai_title,
        "description": thai_desc,
        "line_no": line_no,
        "line_code": line_code,
        "type": type_name,
        "raw_msg": raw_msg
    }

def print_thai_error(err_info):
    sep = "=" * 65
    print("\n" + sep, file=sys.stderr)
    print(f"❌ เกิดข้อผิดพลาด: {err_info['title']}", file=sys.stderr)
    if err_info["line_no"]:
        code_str = f" -> {err_info['line_code']}" if err_info["line_code"] else ""
        print(f"📍 ตำแหน่ง: บรรทัดที่ {err_info['line_no']}{code_str}", file=sys.stderr)
    print(f"💡 คำอธิบาย: {err_info['description']}", file=sys.stderr)
    print(sep + "\n", file=sys.stderr)

# Setup execution
sys.argv = sys.argv[1:]

try:
    with open(target_script, "rb") as f:
        source_bytes = f.read()
    code = compile(source_bytes, target_abs, "exec")
except Exception as e:
    exc_type, exc_value, tb = sys.exc_info()
    err_info = translate_error(exc_type, exc_value, tb, target_abs)
    if err_info["line_no"]:
        print(f"__PYKNW_LINE__:{err_info['line_no']}", flush=True)
    print_thai_error(err_info)
    sys.exit(1)

if delay > 0:
    sys.settrace(trace_callback)

globs = {
    "__name__": "__main__",
    "__file__": target_abs,
    "__doc__": None,
    "__builtins__": __builtins__
}

try:
    exec(code, globs)
except Exception as e:
    sys.settrace(None)
    exc_type, exc_value, tb = sys.exc_info()
    err_info = translate_error(exc_type, exc_value, tb, target_abs)
    if err_info["line_no"]:
        print(f"__PYKNW_LINE__:{err_info['line_no']}", flush=True)
    print_thai_error(err_info)
    sys.exit(1)
