$(function(){
    const init_ctn = function () {
        console.log("欢迎访问我得小站...");
    };

    init_ctn();

    $("#a_home").click(function(){
        alert("页面底部扫码关注，给我留言~~")
    });

    $("#a_github").click(function(){
        alert("马上跳转我的【Github】，欢迎吐槽 ！")
        window.open("https://github.com/yuanq20");
    });


});