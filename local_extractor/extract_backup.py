#!/usr/bin/env python3
import os
import sys
import sqlite3
import shutil
import json
import argparse
from datetime import datetime, timezone
import urllib.request
import urllib.parse

# Local path constants
DEFAULT_BACKUP_PATH = os.path.expanduser('~/Library/Application Support/MobileSync/Backup')
STATE_FILE_NAME = 'sync_state.json'

def get_latest_backup_dir(base_path):
    """Finds the most recently modified backup directory."""
    if not os.path.exists(base_path):
        return None
    
    subdirs = [os.path.join(base_path, d) for d in os.listdir(base_path)]
    subdirs = [d for d in subdirs if os.path.isdir(d)]
    
    if not subdirs:
        return None
        
    # Sort by modification time
    subdirs.sort(key=lambda x: os.path.getmtime(x), reverse=True)
    return subdirs[0]

def parse_manifest_db(backup_dir):
    """Parses Manifest.db to map domains and relative paths to fileIDs."""
    manifest_path = os.path.join(backup_dir, 'Manifest.db')
    if not os.path.exists(manifest_path):
        print(f"[-] Manifest.db not found at {manifest_path}")
        return []
    
    print(f"[+] Connecting to Manifest.db at {manifest_path}")
    conn = sqlite3.connect(manifest_path)
    cursor = conn.cursor()
    
    # Query for Sadhguru and Miracle of Mind storage domains
    query = """
    SELECT fileID, domain, relativePath 
    FROM Files 
    WHERE (domain LIKE '%sadhguru%' 
       OR domain LIKE '%ishafoundation%' 
       OR domain LIKE '%miracleofmind%' 
       OR domain LIKE '%mom%')
      AND flags = 1
    """
    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        print(f"[+] Found {len(rows)} file references in target domains.")
        return [{'fileID': r[0], 'domain': r[1], 'relativePath': r[2]} for r in rows]
    except Exception as e:
        print(f"[-] Error querying Manifest.db: {e}")
        return []
    finally:
        conn.close()

def extract_database_file(backup_dir, file_info, temp_dir):
    """Copies a hashed file from backup to a temporary sqlite file for reading."""
    file_id = file_info['fileID']
    rel_path = file_info['relativePath']
    domain = file_info['domain']
    
    # In iOS 10+, files are stored in subfolders named after the first 2 chars of the fileID
    subfolder = file_id[:2]
    actual_path = os.path.join(backup_dir, subfolder, file_id)
    
    if not os.path.exists(actual_path):
        # Fallback to root backup folder (older formats or specific backups)
        actual_path = os.path.join(backup_dir, file_id)
        if not os.path.exists(actual_path):
            return None
            
    # Copy to temp file with a readable name
    safe_name = f"{domain}_{os.path.basename(rel_path)}"
    temp_path = os.path.join(temp_dir, safe_name)
    shutil.copy2(actual_path, temp_path)
    return temp_path

def inspect_and_extract_completions(db_path, app_name):
    """Dynamically inspects an SQLite database and extracts completion records."""
    completions = []
    if not os.path.exists(db_path):
        return completions
        
    print(f"[+] Scanning {app_name} database: {os.path.basename(db_path)}")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get list of tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cursor.fetchall()]
        print(f"    Tables found: {', '.join(tables)}")
        
        # We will try to find completions dynamically
        # Or look for specific tables we expect or mock
        target_table = None
        for t in tables:
            t_lower = t.lower()
            if any(k in t_lower for k in ['completion', 'sadhana', 'history', 'completed', 'streak', 'session', 'log']):
                target_table = t
                break
                
        if not target_table and tables:
            target_table = tables[0] # fallback to first table
            
        if target_table:
            print(f"    Selected table for extraction: {target_table}")
            cursor.execute(f"PRAGMA table_info({target_table});")
            columns = [r[1] for r in cursor.fetchall()]
            print(f"    Columns: {', '.join(columns)}")
            
            # Find timestamp and practice columns
            time_col = None
            practice_col = None
            
            for col in columns:
                col_lower = col.lower()
                if any(k in col_lower for k in ['time', 'date', 'stamp', 'created']):
                    time_col = col
                if any(k in col_lower for k in ['practice', 'name', 'id', 'title', 'type']):
                    practice_col = col
            
            # Default fallbacks if not detected
            if not time_col and columns:
                time_col = columns[0]
            if not practice_col and len(columns) > 1:
                practice_col = columns[1]
                
            if time_col:
                query = f"SELECT {practice_col or 'rowid'}, {time_col} FROM {target_table}"
                print(f"    Running query: {query}")
                cursor.execute(query)
                rows = cursor.fetchall()
                for r in rows:
                    p_id = str(r[0])
                    raw_time = r[1]
                    
                    # Try to parse timestamp
                    parsed_time = parse_timestamp(raw_time)
                    if parsed_time:
                        completions.append({
                            'practice_id': sanitize_practice_id(p_id, app_name),
                            'timestamp_completed': parsed_time,
                            'raw_value': raw_time
                        })
                        
    except Exception as e:
        print(f"[-] Error parsing database {db_path}: {e}")
    finally:
        conn.close()
        
    return completions

def parse_timestamp(raw):
    """Converts various timestamp formats to ISO 8601 string."""
    if not raw:
        return None
    if isinstance(raw, (int, float)):
        # Check if Unix epoch in seconds or milliseconds
        if raw > 1000000000000: # milliseconds
            raw = raw / 1000.0
        # If it's iOS epoch (seconds since 2001-01-01)
        if raw < 1000000000:
            raw = raw + 978307200 # Convert to Unix epoch
        return datetime.fromtimestamp(raw, tz=timezone.utc).isoformat()
    
    # Try string parsing
    raw_str = str(raw).strip()
    for fmt in ('%Y-%m-%dT%H:%M:%SZ', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(raw_str, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            pass
            
    # Try float parsing if string contains digits
    try:
        val = float(raw_str)
        if val < 1000000000:
            val += 978307200
        return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
    except ValueError:
        pass
        
    return None

def sanitize_practice_id(p_id, app_name):
    """Normalizes practice IDs to match database lookup keys."""
    p_id_clean = p_id.lower().replace(' ', '_').replace('-', '_')
    if app_name.lower() == 'sadhguru':
        if 'shambhavi' in p_id_clean:
            return 'sadhguru_shambhavi'
        elif 'kriya' in p_id_clean:
            return 'sadhguru_isha_kriya'
        elif 'yoga' in p_id_clean:
            return 'sadhguru_upayoga'
        return f"sadhguru_{p_id_clean}"
    else: # Miracle of Mind
        if 'meditation' in p_id_clean:
            return 'mom_meditation'
        elif 'mind' in p_id_clean:
            return 'mom_meditation'
        return f"mom_{p_id_clean}"

def setup_mock_backup(temp_dir):
    """Sets up a complete simulated iOS backup folder with Manifest.db and dummy app SQLite files."""
    mock_backup_base = os.path.join(temp_dir, 'mock_ios_backup')
    # Create a dummy device backup directory
    mock_backup_dir = os.path.join(mock_backup_base, 'device_backup_1234567890abcdef')
    os.makedirs(mock_backup_dir, exist_ok=True)
    
    # Manifest.db path
    manifest_path = os.path.join(mock_backup_dir, 'Manifest.db')
    print(f"[+] Creating mock Manifest.db at {manifest_path}")
    conn = sqlite3.connect(manifest_path)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS Files (
        fileID TEXT PRIMARY KEY,
        domain TEXT,
        relativePath TEXT,
        flags INTEGER
    )""")
    
    # We will generate file IDs as hash-like strings
    sadhguru_db_id = '11223344556677889900aabbccddeeff00112233'
    mom_db_id = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    
    cursor.executemany("""
    INSERT OR REPLACE INTO Files (fileID, domain, relativePath, flags)
    VALUES (?, ?, ?, ?)
    """, [
        (sadhguru_db_id, 'AppDomain-org.ishafoundation.sadhguru', 'Documents/sadhana.sqlite', 1),
        (mom_db_id, 'AppDomain-com.miracleofmind.mom', 'Library/Application Support/mom_data.db', 1)
    ])
    conn.commit()
    conn.close()
    
    # Create Sadhguru mock sqlite database
    # Filename structure: <first 2 chars of fileID>/<fileID>
    sg_dir = os.path.join(mock_backup_dir, sadhguru_db_id[:2])
    os.makedirs(sg_dir, exist_ok=True)
    sg_db_path = os.path.join(sg_dir, sadhguru_db_id)
    
    print(f"[+] Creating mock Sadhguru database at {sg_db_path}")
    conn = sqlite3.connect(sg_db_path)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sadhana_log (
        practice_name TEXT,
        timestamp_completed INTEGER
    )""")
    # Seed mock records
    # iOS Epoch starts 2001-01-01. 2026-06-09T12:00:00Z is approx 802708800 seconds since 2001-01-01
    cursor.executemany("""
    INSERT INTO sadhana_log (practice_name, timestamp_completed)
    VALUES (?, ?)
    """, [
        ('Shambhavi Mahamudra Kriya', 802708800), # 2026-06-09 12:00:00
        ('Isha Kriya', 802716000) # 2026-06-09 14:00:00
    ])
    conn.commit()
    conn.close()
    
    # Create Miracle of Mind mock sqlite database
    mom_dir = os.path.join(mock_backup_dir, mom_db_id[:2])
    os.makedirs(mom_dir, exist_ok=True)
    mom_db_path = os.path.join(mom_dir, mom_db_id)
    
    print(f"[+] Creating mock Miracle of Mind database at {mom_db_path}")
    conn = sqlite3.connect(mom_db_path)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS completed_sessions (
        session_id TEXT,
        completion_date TEXT
    )""")
    cursor.executemany("""
    INSERT INTO completed_sessions (session_id, completion_date)
    VALUES (?, ?)
    """, [
        ('Miracle of Mind Meditation', '2026-06-09T06:30:00Z'),
        ('Miracle of Mind Meditation', '2026-06-08T06:30:00Z')
    ])
    conn.commit()
    conn.close()
    
    return mock_backup_base

def push_to_firebase(completions, project_id, user_id, api_key):
    """Pushes the extracted completions to Firestore database via REST API."""
    print(f"[+] Pushing {len(completions)} completions to Firestore (Project: {project_id})...")
    
    success_count = 0
    for comp in completions:
        # Generate unique completion hash ID
        unique_str = f"{user_id}_{comp['practice_id']}_{comp['timestamp_completed']}"
        import hashlib
        comp_hash = hashlib.md5(unique_str.encode('utf-8')).hexdigest()
        completion_id = f"comp_local_{comp_hash}"
        
        # Build Firestore Document Body
        # Schema: completion_id, user_id, practice_id, timestamp_completed, ingest_method, fallback_verification
        doc_data = {
            "fields": {
                "completion_id": {"stringValue": completion_id},
                "user_id": {"stringValue": user_id},
                "practice_id": {"stringValue": comp['practice_id']},
                "timestamp_completed": {"stringValue": comp['timestamp_completed']},
                "ingest_method": {"stringValue": "track_a_mac_backup"},
                "fallback_verification": {"stringValue": "track_a_mac_backup_verified"}
            }
        }
        
        # Call Firestore REST API
        # Document write URL (using Create or Patch with Document ID)
        # https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/completions/{documentId}
        url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/completions/{completion_id}"
        
        headers = {
            "Content-Type": "application/json"
        }
        
        req_body = json.dumps(doc_data).encode('utf-8')
        req = urllib.request.Request(url, data=req_body, headers=headers, method='PATCH')
        
        try:
            # Note: For open rules or test projects this works directly. If authentication is enabled, 
            # we need to append auth headers. For now we output details and try to execute.
            with urllib.request.urlopen(req) as response:
                res = response.read()
                success_count += 1
        except Exception as e:
            # If REST API throws unauthorized, print it out nicely
            print(f"[-] Failed to push completion {completion_id}: {e}")
            print(f"    Ensure Firestore rules allow writes or include authentication credentials.")
            
    print(f"[+] Push summary: {success_count}/{len(completions)} successfully updated on remote database.")

def main():
    parser = argparse.ArgumentParser(description='SyncSadhana Local iOS Backup database extractor.')
    parser.add_argument('--mock', action='store_true', help='Run in mock mode with a generated test iTunes backup.')
    parser.add_argument('--backup-dir', type=str, default=DEFAULT_BACKUP_PATH, help='Override iOS Backup Directory.')
    parser.add_argument('--project-id', type=str, default='yoga-portal', help='Firebase project ID.')
    parser.add_argument('--user-id', type=str, default='user_gmail_oauth_id_1085', help='Target SyncSadhana User UID.')
    parser.add_argument('--api-key', type=str, default='', help='Firebase project Web API Key (optional).')
    
    args = parser.parse_args()
    
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_extraction')
    os.makedirs(temp_dir, exist_ok=True)
    
    backup_dir = args.backup_dir
    
    if args.mock:
        print("[+] Mock mode enabled.")
        backup_dir = setup_mock_backup(temp_dir)
        
    print(f"[+] Scanning backups in: {backup_dir}")
    latest_backup = get_latest_backup_dir(backup_dir)
    
    if not latest_backup:
        print(f"[-] No iOS backup folder found in {backup_dir}")
        print("    Please ensure you have configured your iOS device to backup to this Mac over Wi-Fi,")
        print("    or run the script with --mock to test local database extraction parsing.")
        sys.exit(1)
        
    print(f"[+] Latest backup folder found: {latest_backup}")
    file_list = parse_manifest_db(latest_backup)
    
    if not file_list:
        print("[-] No matching Sadhguru/MoM app files found in the backup catalog.")
        sys.exit(0)
        
    all_completions = []
    
    for file_info in file_list:
        domain = file_info['domain']
        rel_path = file_info['relativePath']
        
        # Detect app type
        if 'sadhguru' in domain or 'ishafoundation' in domain:
            app_name = 'Sadhguru'
        else:
            app_name = 'MiracleOfMind'
            
        # Extract the file to temp location
        temp_db_path = extract_database_file(latest_backup, file_info, temp_dir)
        
        if temp_db_path:
            # Parse completions
            completions = inspect_and_extract_completions(temp_db_path, app_name)
            all_completions.extend(completions)
            
    print(f"\n[+] Total practice completions extracted: {len(all_completions)}")
    for c in all_completions:
        print(f"    - Practice: {c['practice_id']}, Completed At: {c['timestamp_completed']} (Raw: {c['raw_value']})")
        
    # Push to Firebase
    if all_completions:
        # Load local state to avoid duplicate push
        state_file = os.path.join(temp_dir, STATE_FILE_NAME)
        synced_hashes = []
        if os.path.exists(state_file):
            try:
                with open(state_file, 'r') as sf:
                    synced_hashes = json.load(sf)
            except Exception:
                pass
                
        new_completions = []
        for c in all_completions:
            import hashlib
            h = hashlib.md5(f"{args.user_id}_{c['practice_id']}_{c['timestamp_completed']}".encode('utf-8')).hexdigest()
            if h not in synced_hashes:
                new_completions.append(c)
                synced_hashes.append(h)
                
        if new_completions:
            push_to_firebase(new_completions, args.project_id, args.user_id, args.api_key)
            # Save sync state
            with open(state_file, 'w') as sf:
                json.dump(synced_hashes, sf)
        else:
            print("[+] All extracted completions are already pushed to Firebase. Sync up-to-date.")
            
    # Cleanup temp directory unless running mock
    if not args.mock and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        
    print("[+] Done!")

if __name__ == '__main__':
    main()
