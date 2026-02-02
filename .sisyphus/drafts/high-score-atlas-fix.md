# Draft: High-Score Atlas Card Fix

## Problem Statement
User reported that in the "高分图谱卡片" (high-score atlas card):
1. No user data is being displayed - the leaders list is empty
2. The six rankings (排行榜) are not showing up
3. High-score players corresponding to lpdef for the country should appear in sequence in this card
4. Users who already have GitHub avatars should keep their GitHub avatar icons

## Context

### Related Files
- **Frontend**: `stats2.html`
  - High-score atlas card: `#rtTopTalentsList` (line 1816)
  - Data rendering: lines 2847-2878
  - User meta resolution: `_resolveUserMeta` function (lines 2396-2416)

- **Backend**: `src/worker/index.ts`
  - API endpoint: `/api/country-summary`
  - Data fetch: lines 4884-4999
  - Returns `topByMetrics` array with 6 metrics, each with `leaders[]`

### Data Flow
1. Backend `/api/country-summary` returns `topByMetrics` array
2. Each metric has: key, label, score, user, leaders[]
3. Each leader has: rank, score, user (id, user_name, github_username, fingerprint, user_identity, lpdef)
4. Frontend processes `leaders` and renders them in `#rtTopTalentsList`

### Current Implementation Details

**Frontend (stats2.html lines 2886-2931)**:
- Expects `data.topByMetrics` with 6 metrics
- Renders indicators + carousel pages
- Each page shows top 10 leaders for a metric
- Uses `_resolveUserMeta` to get avatar URLs

**Backend (src/worker/index.ts lines 4884-4999)**:
- Fetches from `v_unified_analysis_v2` view
- Queries 6 metrics: total_messages, total_chars, total_user_chars, avg_user_message_length, jiafang_count, ketao_count
- Returns 6 entries with leaders[] containing user data
- Includes lpdef column if available in view

### Expected Behavior
1. All 6 metrics should be displayed with their respective rankings
2. Each ranking should show up to 10 users with:
   - Rank badge
   - Avatar (GitHub if available, otherwise default)
   - Username (with link to GitHub profile)
   - LPDEF score (if available)
   - Metric score
3. Users with GitHub usernames should have their GitHub avatars displayed
4. Data should be ordered by score (descending)

## Questions to Investigate

1. **Data Retrieval Issue**: Is the backend returning data correctly?
   - Check if `v_unified_analysis_v2` view has the lpdef column
   - Check if the country code validation is working
   - Verify the API endpoint is returning topByMetrics

2. **Frontend Processing Issue**: Is the data being processed correctly?
   - Check if data.topByMetrics is being populated
   - Verify _resolveUserMeta is working with leader user data
   - Check if the carousel rendering logic is working

3. **Avatar Issue**: Are GitHub avatars being displayed correctly?
   - Verify github_username is being passed correctly
   - Check if avatar URL construction is correct

## Scope Boundaries

### INCLUDE
- Fix backend API to return complete user data for high-score atlas
- Fix frontend rendering to display all 6 rankings with user data
- Ensure GitHub avatars are preserved and displayed correctly
- Ensure LPDEF scores are displayed when available

### EXCLUDE
- Changes to the map or other components
- Changes to other statistics cards
- Database schema changes (unless necessary for lpdef column)

## Next Steps
1. Investigate the actual API response
2. Check database view for lpdef column
3. Verify data flow from backend to frontend
4. Fix any issues found in the data retrieval or rendering process

## Root Cause Analysis

### Issue Found

1. **Backend Country Code Validation (src/worker/index.ts:4615)**
   - Backend expects exactly 2-character ISO2 country code
   - Returns 400 error if country.length !== 2
   - When validation fails, frontend can't load any data from API

2. **Frontend Data Extraction (stats2.html:2722)**
   - Frontend extracts topByMetrics from API response
   - If API returns error (400), frontend goes to catch block and shows "No data"
   - When topByMetrics is empty array, carousel shows "暂无高分图谱数据" (line 2871)

3. **Empty Leaders Handling (src/worker/index.ts:4982)**
   - Backend returns 6 empty entries when country code is invalid
   - Each empty entry has leaders: [] and score: null
   - Frontend correctly handles empty arrays but doesn't render any users

### Data Flow Confirmation

✅ Database view v_unified_analysis_v2 HAS lpdef column
✅ Backend fetches user data including lpdef from database
✅ Frontend _resolveUserMeta function correctly resolves GitHub usernames and avatars
✅ Frontend carousel rendering logic is implemented

### The Problem

When country code is invalid or not provided correctly:
1. Backend returns 400 error
2. Frontend can't load data
3. data.topByMetrics is empty
4. High-score atlas shows "No data" instead of rankings

### Possible Causes for Empty Data

1. Country code being passed is not exactly 2 characters (empty string, 3+ characters, null)
2. API response structure doesn't match frontend expectations
3. v_unified_analysis_v2 view returns no data for the specific country
4. Backend query is failing silently

## Investigation Plan

1. Debug what country code is being passed from frontend to API
2. Check browser console for API errors
3. Verify database has data for the specific country
4. Ensure API response includes topByMetrics in correct format

## Technical Investigation Summary

### Data Flow Analysis

1. **Frontend Call** (stats2.html:2696)
   - URL: `${API_ENDPOINT}api/country-summary?country=${countryCode}`
   - Country code must be 2-character ISO2 format
   - Timestamp parameter prevents cache issues

2. **Backend Validation** (src/worker/index.ts:4615)
   - Validates country parameter is exactly 2 characters
   - Returns 400 error if validation fails
   - Fetches data from v_unified_analysis_v2 view

3. **Data Processing** (src/worker/index.ts:4884-4999)
   - Queries 6 metrics from database
   - Returns 6 entries with leaders array
   - Each leader contains user data including lpdef

4. **Frontend Rendering** (stats2.html:2886-2931)
   - Expects topByMetrics array with 6 items
   - Renders carousel with indicators
   - Shows top 10 leaders per metric

### Confirmed Working Components
✅ Database view has lpdef column
✅ Backend API endpoint exists and is called
✅ Frontend rendering logic is implemented
✅ GitHub avatar URL construction is correct

### Root Cause Candidates
1. Invalid country code being passed to API
2. API returning error (400) which frontend catches silently
3. Database returning no data for the queried country
4. Network/API connectivity issues
5. Frontend data extraction failing (topByMetrics not being populated)

## Work Plan Required

Need to:
1. Add debug logging to identify API response status
2. Verify country code is correctly passed and validated
3. Ensure API returns proper structure with topByMetrics
4. Fix any issues in data retrieval or frontend processing
5. Test the fix with actual data
