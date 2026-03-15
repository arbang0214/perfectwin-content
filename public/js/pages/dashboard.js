export function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">발행 대시보드</h1>
      <p class="page-subtitle">생성된 콘텐츠의 발행 상태를 관리합니다</p>
    </div>
    <div class="empty-page">
      <div class="empty-icon">📊</div>
      <h2>발행 대시보드</h2>
      <p>이미지 업로드, 발행 상태 관리, 채널별 자동 발행 기능이 추가될 예정입니다</p>
      <span class="coming-badge">다음 업데이트 예정</span>
    </div>
  `;
}
